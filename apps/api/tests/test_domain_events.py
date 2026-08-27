from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import get_principal
from app.db.session import get_db
from app.main import app
from app.models.domain_event import DomainEvent
from app.models.enums import (
    DomainAggregateType,
    DomainEventType,
    InvoiceStatus,
    InvoiceType,
    UserRole,
)
from app.schemas.principal import Principal
from app.services.events import emit_domain_event


class FakeSession:
    def __init__(self) -> None:
        self.objects: list[object] = []

    def add(self, value: object) -> None:
        self.objects.append(value)


def make_principal() -> Principal:
    return Principal(
        company_id=uuid4(),
        company_name="CrewPilot",
        email="owner@example.com",
        full_name="Omar Owner",
        role=UserRole.OWNER,
        user_id=uuid4(),
    )


def test_emit_domain_event_appends_tenant_scoped_envelope() -> None:
    principal = make_principal()
    aggregate_id = uuid4()
    session = FakeSession()

    event = emit_domain_event(
        session,  # type: ignore[arg-type]
        principal,
        aggregate_id=aggregate_id,
        aggregate_type=DomainAggregateType.JOB,
        event_type=DomainEventType.JOB_SCHEDULED,
        payload={"status": "scheduled", "aggregate_id": aggregate_id},
    )

    assert session.objects == [event]
    assert event.company_id == principal.company_id
    assert event.actor_user_id == principal.user_id
    assert event.aggregate_id == aggregate_id
    assert event.aggregate_type == "job"
    assert event.event_type == "job.scheduled"
    assert event.source == "api"
    assert event.correlation_id is None
    assert event.payload == {"status": "scheduled", "aggregate_id": str(aggregate_id)}


def test_emit_domain_event_serializes_enums_and_uuids_in_payload() -> None:
    principal = make_principal()
    invoice_id = uuid4()
    session = FakeSession()

    event = emit_domain_event(
        session,  # type: ignore[arg-type]
        principal,
        aggregate_id=invoice_id,
        aggregate_type=DomainAggregateType.INVOICE,
        event_type=DomainEventType.INVOICE_PAID,
        payload={"document_type": InvoiceType.INVOICE, "status": InvoiceStatus.PAID},
    )

    assert event.payload == {
        "document_type": "invoice",
        "status": "paid",
    }


def test_emit_domain_event_accepts_correlation_id_and_custom_source() -> None:
    principal = make_principal()
    correlation_id = uuid4()
    session = FakeSession()

    event = emit_domain_event(
        session,  # type: ignore[arg-type]
        principal,
        aggregate_id=uuid4(),
        aggregate_type=DomainAggregateType.CUSTOMER,
        correlation_id=correlation_id,
        event_type=DomainEventType.CUSTOMER_CREATED,
        source="worker",
    )

    assert event.correlation_id == correlation_id
    assert event.source == "worker"


class FakeScalars:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def all(self) -> list[object]:
        return self.rows


class FakeScalarsResult:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def scalars(self) -> FakeScalars:
        return FakeScalars(self.rows)


class FakeEventsSession:
    def __init__(self, events: list[DomainEvent]) -> None:
        self.events = events

    async def execute(self, statement):  # noqa: ANN001
        return FakeScalarsResult(self.events)


def make_domain_event() -> DomainEvent:
    ordered_at = datetime(2026, 8, 27, 12, 0, 0, tzinfo=UTC)
    return DomainEvent(
        actor_user_id=uuid4(),
        aggregate_id=uuid4(),
        aggregate_type="invoice",
        company_id=uuid4(),
        correlation_id=None,
        event_type="invoice.paid",
        id=uuid4(),
        occurred_at=ordered_at,
        payload={"status": "paid"},
        source="api",
    )


def test_events_endpoint_returns_tenant_scoped_event_stream() -> None:
    principal = make_principal()
    event = make_domain_event()
    event.company_id = principal.company_id

    async def events_override():
        yield FakeEventsSession([event])

    async def principal_override():
        return principal

    app.dependency_overrides[get_db] = events_override
    app.dependency_overrides[get_principal] = principal_override
    try:
        response = TestClient(app).get("/api/v1/events")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["event_type"] == "invoice.paid"
    assert payload[0]["aggregate_type"] == "invoice"
    assert payload[0]["payload"] == {"status": "paid"}
