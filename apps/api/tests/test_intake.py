import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from app.models.customer import Customer
from app.models.domain_event import DomainEvent
from app.models.enums import (
    DomainAggregateType,
    DomainEventType,
    IntakeRecordKind,
    IntakeRecordStatus,
    UserRole,
)
from app.models.intake_record import IntakeRecord
from app.schemas.principal import Principal
from app.services.intake import convert_intake_record, intake_event_payload


class FakeSession:
    def __init__(self) -> None:
        self.objects: list[object] = []

    def add(self, value: object) -> None:
        self.objects.append(value)

    async def flush(self) -> None:  # noqa: D102
        return None

    async def commit(self) -> None:  # noqa: D102
        return None

    async def refresh(self, _instance: object) -> None:  # noqa: D102
        return None


def make_principal() -> Principal:
    return Principal(
        company_id=uuid4(),
        company_name="CrewPilot",
        email="owner@example.com",
        full_name="Omar Owner",
        role=UserRole.OWNER,
        user_id=uuid4(),
    )


def make_record(**overrides: object) -> IntakeRecord:
    now = datetime(2026, 8, 12, tzinfo=UTC)
    defaults: dict[str, object] = {
        "id": uuid4(),
        "company_id": uuid4(),
        "kind": IntakeRecordKind.LEAD,
        "status": IntakeRecordStatus.NEW,
        "name": None,
        "phone": None,
        "source": None,
        "notes": None,
        "customer_id": None,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return IntakeRecord(**defaults)  # type: ignore[arg-type]


def convert(record: IntakeRecord, principal: Principal, session: FakeSession) -> Customer:
    return asyncio.run(
        convert_intake_record(
            record,
            session,  # type: ignore[arg-type]
            principal,
        )
    )


def test_intake_event_payload_matches_record_fields() -> None:
    record = make_record(
        kind=IntakeRecordKind.CALL,
        name="Dana Reyes",
        phone="+15550123",
        source="missed call",
        status=IntakeRecordStatus.NEW,
    )

    payload = intake_event_payload(record)

    assert payload == {
        "kind": record.kind,
        "status": record.status,
        "name": "Dana Reyes",
        "phone": "+15550123",
        "source": "missed call",
    }


def test_convert_intake_record_creates_customer_and_links_record() -> None:
    principal = make_principal()
    session = FakeSession()
    record = make_record(
        company_id=principal.company_id,
        name="Dana Reyes",
        phone="+15550123",
        source="web form",
        notes="Wants a quote for a heat pump.",
    )

    customer = convert(record, principal, session)

    assert isinstance(customer, Customer)
    assert customer.company_id == principal.company_id
    assert customer.name == "Dana Reyes"
    assert customer.phone == "+15550123"
    assert customer.source == "web form"
    assert customer.status == "lead"
    assert customer.notes == "Wants a quote for a heat pump."
    assert record.status == "converted"
    assert record.customer_id == customer.id

    events = [obj for obj in session.objects if isinstance(obj, DomainEvent)]
    event_types = {event.event_type for event in events}
    assert event_types == {
        DomainEventType.INTAKE_RECORD_CONVERTED.value,
        DomainEventType.CUSTOMER_CREATED.value,
    }
    intake_event = next(
        event for event in events if event.aggregate_type == DomainAggregateType.INTAKE.value
    )
    assert intake_event.aggregate_id == record.id
    assert intake_event.payload["customer_id"] == customer.id
    assert intake_event.company_id == principal.company_id

    audit_actions = [getattr(obj, "action", None) for obj in session.objects]
    assert "intake.converted" in audit_actions


def test_convert_intake_record_falls_back_name_and_source() -> None:
    principal = make_principal()
    session = FakeSession()
    record = make_record(company_id=principal.company_id, phone="+15559999")

    customer = convert(record, principal, session)

    assert customer.name == "New lead"
    assert customer.source == "intake"
    assert customer.phone == "+15559999"
    assert record.customer_id == customer.id
