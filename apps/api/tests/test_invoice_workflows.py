from app.api.v1.endpoints.invoices import (
    append_workflow_note,
    converted_invoice_title,
    invoice_transition_event_type,
)
from app.models.enums import DomainEventType, InvoiceStatus, InvoiceType


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


def test_invoice_transition_event_type_falls_back_to_updated() -> None:
    assert (
        invoice_transition_event_type(
            next_status=InvoiceStatus.VOID,
            next_type=InvoiceType.INVOICE,
            previous_status=InvoiceStatus.SENT,
            previous_type=InvoiceType.INVOICE,
        )
        == DomainEventType.INVOICE_UPDATED
    )
