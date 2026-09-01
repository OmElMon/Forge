import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.invoices import (
    REOPEN_TARGETS,
    WORKFLOW_GUARDED_STATUSES,
    append_workflow_note,
    converted_invoice_title,
    invoice_transition_event_type,
    update_invoice,
)
from app.models.enums import DomainEventType, InvoiceStatus, InvoiceType, UserRole
from app.schemas.invoice import InvoiceUpdate
from app.schemas.principal import Principal


class InvoiceResult:
    def __init__(self, invoice: object) -> None:
        self.invoice = invoice

    def scalar_one_or_none(self) -> object:
        return self.invoice


class GuardSession:
    def __init__(self, invoice: object) -> None:
        self.invoice = invoice

    async def execute(self, _statement: object) -> InvoiceResult:
        return InvoiceResult(self.invoice)

    async def commit(self) -> None:
        return None

    async def refresh(self, _invoice: object) -> None:
        return None

    def add(self, _value: object) -> None:
        return None


def principal() -> Principal:
    return Principal(
        company_id=uuid4(),
        email="owner@example.com",
        full_name="Owner",
        role=UserRole.OWNER,
        user_id=uuid4(),
        company_name="Ace HVAC",
    )


def make_invoice(status: InvoiceStatus, document_type: InvoiceType = InvoiceType.INVOICE) -> object:
    return SimpleNamespace(
        amount_cents=1000,
        company_id=uuid4(),
        customer_id=uuid4(),
        document_type=document_type,
        id=uuid4(),
        job_id=None,
        status=status,
        title="Furnace service",
    )


def test_update_invoice_rejects_workflow_guarded_status_via_patch() -> None:
    session = GuardSession(make_invoice(InvoiceStatus.DRAFT))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            update_invoice(
                uuid4(),
                InvoiceUpdate(status=InvoiceStatus.VOID),
                session,
                principal(),
            )
        )
    assert exc.value.status_code == 409


def test_update_invoice_rejects_reopen_via_patch() -> None:
    session = GuardSession(make_invoice(InvoiceStatus.VOID))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            update_invoice(
                uuid4(),
                InvoiceUpdate(status=InvoiceStatus.DRAFT),
                session,
                principal(),
            )
        )
    assert exc.value.status_code == 409


def test_workflow_guarded_statuses_match_dedicated_actions() -> None:
    assert WORKFLOW_GUARDED_STATUSES == {
        InvoiceStatus.VOID,
        InvoiceStatus.CONVERTED,
        InvoiceStatus.PAID,
    }


def test_converted_invoice_title_replaces_estimate_language() -> None:
    assert converted_invoice_title("Furnace replacement estimate") == "Furnace Replacement Invoice"


def test_converted_invoice_title_appends_invoice_when_estimate_is_missing() -> None:
    assert converted_invoice_title("Seasonal maintenance") == "Seasonal maintenance invoice"


def test_append_workflow_note_preserves_existing_notes() -> None:
    result = append_workflow_note(
        "Customer approved by phone.",
        "Converted from approved estimate.",
    )

    assert result == "Customer approved by phone.\n\nConverted from approved estimate."


def test_invoice_transition_event_type_classifies_send() -> None:
    assert (
        invoice_transition_event_type(
            next_status=InvoiceStatus.SENT,
            next_type=InvoiceType.INVOICE,
            previous_status=InvoiceStatus.DRAFT,
            previous_type=InvoiceType.INVOICE,
        )
        == DomainEventType.INVOICE_SENT
    )


def test_invoice_transition_event_type_classifies_approve() -> None:
    assert (
        invoice_transition_event_type(
            next_status=InvoiceStatus.APPROVED,
            next_type=InvoiceType.ESTIMATE,
            previous_status=InvoiceStatus.SENT,
            previous_type=InvoiceType.ESTIMATE,
        )
        == DomainEventType.ESTIMATE_APPROVED
    )


def test_invoice_transition_event_type_classifies_paid() -> None:
    assert (
        invoice_transition_event_type(
            next_status=InvoiceStatus.PAID,
            next_type=InvoiceType.INVOICE,
            previous_status=InvoiceStatus.SENT,
            previous_type=InvoiceType.INVOICE,
        )
        == DomainEventType.INVOICE_PAID
    )


def test_invoice_transition_event_type_classifies_convert() -> None:
    assert (
        invoice_transition_event_type(
            next_status=InvoiceStatus.SENT,
            next_type=InvoiceType.INVOICE,
            previous_status=InvoiceStatus.APPROVED,
            previous_type=InvoiceType.ESTIMATE,
        )
        == DomainEventType.ESTIMATE_CONVERTED
    )


def test_invoice_transition_event_type_classifies_void() -> None:
    assert (
        invoice_transition_event_type(
            next_status=InvoiceStatus.VOID,
            next_type=InvoiceType.INVOICE,
            previous_status=InvoiceStatus.SENT,
            previous_type=InvoiceType.INVOICE,
        )
        == DomainEventType.INVOICE_VOIDED
    )


def test_invoice_transition_event_type_classifies_reopen() -> None:
    assert (
        invoice_transition_event_type(
            next_status=InvoiceStatus.DRAFT,
            next_type=InvoiceType.INVOICE,
            previous_status=InvoiceStatus.VOID,
            previous_type=InvoiceType.INVOICE,
        )
        == DomainEventType.INVOICE_REOPENED
    )


def test_reopen_targets_cover_void_converted_and_paid() -> None:
    assert REOPEN_TARGETS[InvoiceStatus.VOID] == {InvoiceStatus.DRAFT, InvoiceStatus.SENT}
    assert REOPEN_TARGETS[InvoiceStatus.CONVERTED] == {InvoiceStatus.DRAFT}
    assert REOPEN_TARGETS[InvoiceStatus.PAID] == {InvoiceStatus.SENT}


def test_invoice_transition_event_type_falls_back_to_updated() -> None:
    assert (
        invoice_transition_event_type(
            next_status=InvoiceStatus.DRAFT,
            next_type=InvoiceType.ESTIMATE,
            previous_status=InvoiceStatus.DRAFT,
            previous_type=InvoiceType.ESTIMATE,
        )
        == DomainEventType.INVOICE_UPDATED
    )
