from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.models.domain_event import DomainEvent
from app.models.enums import (
    DomainAggregateType,
    DomainEventType,
    FollowupTaskStatus,
    InvoiceType,
    UserRole,
)
from app.models.followup_task import FollowupTask
from app.schemas.principal import Principal
from app.services.automation_rules import (
    ESTIMATE_APPROVED_RULE,
    ESTIMATE_SENT_RULE,
    INVOICE_SENT_RULE,
    RULE_ESTIMATE_SENT,
    deliver_due_followups,
    followup_unique_key,
    materialize_pending_followups,
    resolve_followup,
    rule_spec_for_event,
)

NOW = datetime(2026, 8, 27, 12, 0, 0, tzinfo=UTC)

COMPANY_ID = uuid4()
USER_ID = uuid4()


def make_principal() -> Principal:
    return Principal(
        company_id=COMPANY_ID,
        company_name="Demo Services",
        email="owner@example.com",
        full_name="Demo Owner",
        role=UserRole.OWNER,
        user_id=USER_ID,
    )


def make_event(
    event_type: DomainEventType,
    *,
    aggregate_id: object,
    payload: dict[str, object] | None = None,
    occurred_at: datetime | None = None,
    correlation_id: object = None,
) -> DomainEvent:
    return DomainEvent(
        aggregate_id=aggregate_id,  # type: ignore[arg-type]
        aggregate_type=DomainAggregateType.INVOICE.value,
        correlation_id=correlation_id,  # type: ignore[arg-type]
        company_id=COMPANY_ID,
        event_type=event_type.value,
        occurred_at=occurred_at or NOW,
        payload=payload or {},
        source="api",
    )


class ScalarRows:
    def __init__(self, rows: list[object]) -> None:
        self._rows = list(rows)

    def scalars(self):
        return self

    def all(self) -> list[object]:
        return self._rows


class FakeSession:
    def __init__(
        self, *, events: list[object] | None = None, open_followups: list[object] | None = None
    ) -> None:
        self.events = list(events or [])
        self.open_followups = list(open_followups or [])
        self.added: list[object] = []

    async def execute(self, statement):
        text = str(statement)
        if "domain_events" in text:
            return ScalarRows(self.events)
        if "followup_tasks" in text:
            loaded = self.open_followups + [
                obj for obj in self.added if isinstance(obj, FollowupTask)
            ]
            return ScalarRows(loaded)
        return ScalarRows([])

    def add(self, obj: object) -> None:
        self.added.append(obj)


def added_events(session: FakeSession) -> list[DomainEvent]:
    return [obj for obj in session.added if isinstance(obj, DomainEvent)]


def added_followups(session: FakeSession) -> list[FollowupTask]:
    return [obj for obj in session.added if isinstance(obj, FollowupTask)]


def test_estimate_sent_maps_to_followup_rule() -> None:
    event = make_event(
        DomainEventType.INVOICE_SENT,
        aggregate_id=uuid4(),
        payload={"customer_id": str(uuid4()), "document_type": InvoiceType.ESTIMATE.value},
    )
    assert rule_spec_for_event(event) == ESTIMATE_SENT_RULE


def test_invoice_sent_maps_to_payment_rule() -> None:
    event = make_event(
        DomainEventType.INVOICE_SENT,
        aggregate_id=uuid4(),
        payload={"customer_id": str(uuid4()), "document_type": InvoiceType.INVOICE.value},
    )
    assert rule_spec_for_event(event) == INVOICE_SENT_RULE


def test_estimate_approved_maps_to_convert_rule() -> None:
    event = make_event(
        DomainEventType.ESTIMATE_APPROVED,
        aggregate_id=uuid4(),
        payload={"customer_id": str(uuid4()), "document_type": InvoiceType.ESTIMATE.value},
    )
    assert rule_spec_for_event(event) == ESTIMATE_APPROVED_RULE


def test_unrelated_events_match_no_rule() -> None:
    unrelated = [
        make_event(DomainEventType.JOB_COMPLETED, aggregate_id=uuid4()),
        make_event(DomainEventType.CUSTOMER_CREATED, aggregate_id=uuid4()),
        make_event(
            DomainEventType.INVOICE_SENT,
            aggregate_id=uuid4(),
            payload={"customer_id": str(uuid4())},
        ),
    ]
    assert all(rule_spec_for_event(event) is None for event in unrelated)


def make_overdue_followup() -> FollowupTask:
    return FollowupTask(
        company_id=COMPANY_ID,
        customer_id=uuid4(),
        rule_type=RULE_ESTIMATE_SENT,
        title="Estimate awaiting follow-up",
        status=FollowupTaskStatus.OPEN,
        unique_key=followup_unique_key(RULE_ESTIMATE_SENT, uuid4()),
        due_at=NOW - timedelta(days=2),
    )


async def test_deliver_due_marks_delivered_and_emits_event() -> None:
    followup = make_overdue_followup()
    session = FakeSession(open_followups=[followup])

    delivered = await deliver_due_followups(session, make_principal(), now=NOW)

    (due,) = delivered
    assert due.id == followup.id
    assert due.delivered_at == NOW

    (event,) = added_events(session)
    assert event.event_type == DomainEventType.FOLLOWUP_DUE.value
    assert event.source == "automation"
    assert event.aggregate_id == followup.id
    assert event.payload["rule_type"] == RULE_ESTIMATE_SENT
    assert event.payload["title"] == "Estimate awaiting follow-up"


async def test_deliver_skips_future_due_and_resolved() -> None:
    not_due = FollowupTask(
        company_id=COMPANY_ID,
        customer_id=uuid4(),
        rule_type=RULE_ESTIMATE_SENT,
        title="Estimate awaiting follow-up",
        status=FollowupTaskStatus.OPEN,
        unique_key=followup_unique_key(RULE_ESTIMATE_SENT, uuid4()),
        due_at=NOW + timedelta(days=5),
    )
    resolved = FollowupTask(
        company_id=COMPANY_ID,
        customer_id=uuid4(),
        rule_type=RULE_ESTIMATE_SENT,
        title="Estimate awaiting follow-up",
        status=FollowupTaskStatus.RESOLVED,
        unique_key=followup_unique_key(RULE_ESTIMATE_SENT, uuid4()),
        due_at=NOW - timedelta(days=1),
    )
    session = FakeSession(open_followups=[not_due, resolved])

    delivered = await deliver_due_followups(session, make_principal(), now=NOW)

    assert delivered == []
    assert not_due.delivered_at is None
    assert resolved.delivered_at is None
    assert added_events(session) == []


async def test_deliver_is_idempotent_for_already_delivered() -> None:
    followup = make_overdue_followup()
    followup.delivered_at = NOW
    session = FakeSession(open_followups=[followup])

    delivered = await deliver_due_followups(session, make_principal(), now=NOW)

    assert delivered == []
    assert added_events(session) == []


def test_unique_key_is_stable_per_rule_and_aggregate() -> None:
    aggregate_id = uuid4()
    assert followup_unique_key(RULE_ESTIMATE_SENT, aggregate_id) == followup_unique_key(
        RULE_ESTIMATE_SENT, aggregate_id
    )
    assert followup_unique_key(RULE_ESTIMATE_SENT, aggregate_id) != followup_unique_key(
        RULE_ESTIMATE_SENT, uuid4()
    )


async def test_materialize_creates_followup_and_event() -> None:
    customer_id = uuid4()
    invoice_id = uuid4()
    session = FakeSession(
        events=[
            make_event(
                DomainEventType.INVOICE_SENT,
                aggregate_id=invoice_id,
                payload={
                    "customer_id": str(customer_id),
                    "document_type": InvoiceType.ESTIMATE.value,
                    "title": "AC tune-up (Estimate)",
                },
            )
        ]
    )

    created = await materialize_pending_followups(session, make_principal(), now=NOW)

    (followup,) = created
    assert len(added_followups(session)) == 1
    assert followup.company_id == COMPANY_ID
    assert followup.customer_id == customer_id
    assert followup.invoice_id == invoice_id
    assert followup.rule_type == RULE_ESTIMATE_SENT
    assert followup.status == FollowupTaskStatus.OPEN
    assert followup.title == "Estimate awaiting follow-up"
    assert followup.notes == "AC tune-up (Estimate)"
    assert followup.unique_key == followup_unique_key(RULE_ESTIMATE_SENT, invoice_id)
    assert followup.due_at is not None
    assert followup.due_at.date() == (NOW + timedelta(days=5)).date()

    created_events = added_events(session)
    assert len(created_events) == 1
    assert created_events[0].event_type == DomainEventType.FOLLOWUP_CREATED.value
    assert created_events[0].source == "automation"


async def test_materialize_is_idempotent_across_scans() -> None:
    event = make_event(
        DomainEventType.INVOICE_SENT,
        aggregate_id=uuid4(),
        payload={"customer_id": str(uuid4()), "document_type": InvoiceType.ESTIMATE.value},
    )
    session = FakeSession(events=[event])

    first = await materialize_pending_followups(session, make_principal(), now=NOW)
    assert len(first) == 1

    second = await materialize_pending_followups(session, make_principal(), now=NOW)
    assert second == []
    assert len(added_followups(session)) == 1


async def test_approval_promotes_and_resolves_prior_sent_followup() -> None:
    customer_id = uuid4()
    invoice_id = uuid4()
    sent_task = FollowupTask(
        company_id=COMPANY_ID,
        customer_id=customer_id,
        invoice_id=invoice_id,
        rule_type=RULE_ESTIMATE_SENT,
        title="Estimate awaiting follow-up",
        status=FollowupTaskStatus.OPEN,
        unique_key=followup_unique_key(RULE_ESTIMATE_SENT, invoice_id),
        due_at=NOW + timedelta(days=5),
    )
    session = FakeSession(
        events=[
            make_event(
                DomainEventType.INVOICE_SENT,
                aggregate_id=invoice_id,
                payload={
                    "customer_id": str(customer_id),
                    "document_type": InvoiceType.ESTIMATE.value,
                    "title": "Tankless install (Estimate)",
                },
            ),
            make_event(
                DomainEventType.ESTIMATE_APPROVED,
                aggregate_id=invoice_id,
                payload={
                    "customer_id": str(customer_id),
                    "document_type": InvoiceType.ESTIMATE.value,
                    "title": "Tankless install (Estimate)",
                },
                occurred_at=NOW + timedelta(minutes=5),
            ),
        ],
        open_followups=[sent_task],
    )

    created = await materialize_pending_followups(session, make_principal(), now=NOW)

    assert len(created) == 1
    assert created[0].rule_type == "estimate.approved"
    assert created[0].title == "Estimate ready to convert"
    assert sent_task.status == FollowupTaskStatus.RESOLVED
    assert sent_task.resolved_at is not None
    assert sent_task.resolved_by_user_id is None

    event_types = {event.event_type for event in added_events(session)}
    assert DomainEventType.FOLLOWUP_RESOLVED.value in event_types
    assert DomainEventType.FOLLOWUP_CREATED.value in event_types


async def test_resolve_followup_marks_completed_and_is_idempotent() -> None:
    followup = FollowupTask(
        company_id=COMPANY_ID,
        customer_id=uuid4(),
        rule_type=RULE_ESTIMATE_SENT,
        title="Estimate awaiting follow-up",
        status=FollowupTaskStatus.OPEN,
        unique_key=followup_unique_key(RULE_ESTIMATE_SENT, uuid4()),
        due_at=NOW + timedelta(days=5),
    )
    session = FakeSession()

    await resolve_followup(session, make_principal(), followup, user_id=USER_ID, now=NOW)

    assert followup.status == FollowupTaskStatus.RESOLVED
    assert followup.resolved_at == NOW
    assert followup.resolved_by_user_id == USER_ID
    resolved_events = added_events(session)
    assert len(resolved_events) == 1
    assert resolved_events[0].event_type == DomainEventType.FOLLOWUP_RESOLVED.value

    await resolve_followup(session, make_principal(), followup, user_id=USER_ID, now=NOW)
    assert len(added_events(session)) == 1  # idempotent: no duplicate event
