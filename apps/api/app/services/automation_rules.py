from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.domain_event import DomainEvent
from app.models.enums import (
    DomainAggregateType,
    DomainEventType,
    FollowupTaskStatus,
    InvoiceType,
)
from app.models.followup_task import FollowupTask
from app.schemas.principal import Principal
from app.services.automation_policies import enabled_policy_types
from app.services.events import emit_domain_event
from app.services.integrations import (
    MessageChannel,
    OutboundMessage,
    SendResult,
    get_messaging_provider,
)

LOOKBACK_DAYS = 90
ESTIMATE_FOLLOWUP_DUE_DAYS = 5
ESTIMATE_CONVERT_DUE_DAYS = 3
INVOICE_PAYMENT_FOLLOWUP_DAYS = 14
JOB_INVOICE_FOLLOWUP_DAYS = 2

RULE_ESTIMATE_SENT = "estimate.sent"
RULE_ESTIMATE_APPROVED = "estimate.approved"
RULE_INVOICE_SENT = "invoice.sent"
RULE_INVOICE_CREATE = "invoice.create"


@dataclass(frozen=True)
class FollowupRule:
    rule_type: str
    title: str
    due_days: int
    description: str = ""


ESTIMATE_SENT_RULE = FollowupRule(
    rule_type=RULE_ESTIMATE_SENT,
    title="Estimate awaiting follow-up",
    due_days=ESTIMATE_FOLLOWUP_DUE_DAYS,
    description="Follow up with a customer after an estimate is sent.",
)
ESTIMATE_APPROVED_RULE = FollowupRule(
    rule_type=RULE_ESTIMATE_APPROVED,
    title="Estimate ready to convert",
    due_days=ESTIMATE_CONVERT_DUE_DAYS,
    description="Convert a customer-approved estimate into a billable invoice.",
)
INVOICE_SENT_RULE = FollowupRule(
    rule_type=RULE_INVOICE_SENT,
    title="Invoice awaiting payment",
    due_days=INVOICE_PAYMENT_FOLLOWUP_DAYS,
    description="Chase payment on an invoice that has been sent.",
)
JOB_INVOICE_RULE = FollowupRule(
    rule_type=RULE_INVOICE_CREATE,
    title="Job completed — create and send invoice",
    due_days=JOB_INVOICE_FOLLOWUP_DAYS,
    description="Create and send the invoice for a completed job.",
)

AUTOMATION_POLICIES: tuple[FollowupRule, ...] = (
    ESTIMATE_SENT_RULE,
    ESTIMATE_APPROVED_RULE,
    INVOICE_SENT_RULE,
    JOB_INVOICE_RULE,
)


def rule_by_type(rule_type: str) -> FollowupRule | None:
    return next((rule for rule in AUTOMATION_POLICIES if rule.rule_type == rule_type), None)


ROUTED_EVENT_TYPES = {
    DomainEventType.INVOICE_SENT.value,
    DomainEventType.ESTIMATE_APPROVED.value,
    DomainEventType.JOB_COMPLETED.value,
}


def rule_spec_for_event(event: DomainEvent) -> FollowupRule | None:
    """Map a domain event to the automation rule it triggers, if any."""
    if event.event_type == DomainEventType.INVOICE_SENT.value:
        if event.payload.get("document_type") == InvoiceType.ESTIMATE.value:
            return ESTIMATE_SENT_RULE
        if event.payload.get("document_type") == InvoiceType.INVOICE.value:
            return INVOICE_SENT_RULE
        return None
    if event.event_type == DomainEventType.ESTIMATE_APPROVED.value:
        return ESTIMATE_APPROVED_RULE
    if event.event_type == DomainEventType.JOB_COMPLETED.value:
        return JOB_INVOICE_RULE
    return None


def followup_unique_key(rule_type: str, aggregate_id: UUID) -> str:
    return f"{rule_type}:{aggregate_id}"


def _coerce_uuid(value: object) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    if isinstance(value, str):
        return UUID(value)
    return None


async def materialize_pending_followups(
    db: AsyncSession,
    principal: Principal,
    *,
    now: datetime | None = None,
    policy_enabled: set[str] | None = None,
) -> list[FollowupTask]:
    """Turn operational domain events into follow-up tasks (idempotent).

    Scans the tenant's recent event stream for routed event types and creates an
    open follow-up for each new ``(rule, aggregate)`` pair. Approval of an
    estimate resolves its earlier "awaiting follow-up" task, and sending an
    invoice auto-resolves a completed job's "create and send invoice" task.
    Because the partial unique index rejects duplicate open tasks, repeated
    scans are safe. Passing ``policy_enabled`` (the company's enabled rule
    types) skips materialization for disabled policies.
    """
    current_time = now or datetime.now(UTC)
    window_start = current_time - timedelta(days=LOOKBACK_DAYS)
    events_result = await db.execute(
        select(DomainEvent)
        .where(
            DomainEvent.company_id == principal.company_id,
            DomainEvent.event_type.in_(ROUTED_EVENT_TYPES),
            DomainEvent.occurred_at >= window_start,
        )
        .order_by(DomainEvent.occurred_at.asc())
    )
    events = list(events_result.scalars().all())
    if not events:
        return []

    open_result = await db.execute(
        select(FollowupTask).where(
            FollowupTask.company_id == principal.company_id,
            FollowupTask.status == FollowupTaskStatus.OPEN,
        )
    )
    open_by_key = {
        task.unique_key: task for task in open_result.scalars().all() if task.unique_key is not None
    }

    created: list[FollowupTask] = []
    for event in events:
        rule = rule_spec_for_event(event)
        if rule is None:
            continue
        key = followup_unique_key(rule.rule_type, event.aggregate_id)

        if rule is ESTIMATE_APPROVED_RULE:
            await _resolve_estimate_sent_followups(
                db, principal, event.aggregate_id, now=current_time
            )

        if (
            event.event_type == DomainEventType.INVOICE_SENT.value
            and event.payload.get("document_type") == InvoiceType.INVOICE.value
        ):
            await _resolve_job_invoice_followups(
                db,
                principal,
                _coerce_uuid(event.payload.get("job_id")),
                now=current_time,
                open_by_key=open_by_key,
            )

        if policy_enabled is not None and rule.rule_type not in policy_enabled:
            continue

        if key in open_by_key:
            continue
        followup = _build_followup(principal, event, rule, key=key, now=current_time)
        db.add(followup)
        open_by_key[key] = followup
        created.append(followup)
        emit_domain_event(
            db,
            principal,
            aggregate_id=followup.id,
            aggregate_type=DomainAggregateType.FOLLOWUP,
            correlation_id=event.correlation_id,
            event_type=DomainEventType.FOLLOWUP_CREATED,
            payload={
                "customer_id": followup.customer_id,
                "due_at": followup.due_at.isoformat() if followup.due_at else None,
                "invoice_id": followup.invoice_id,
                "rule_type": followup.rule_type,
                "status": followup.status,
            },
            source="automation",
        )
    return created


def _build_followup(
    principal: Principal,
    event: DomainEvent,
    rule: FollowupRule,
    *,
    key: str,
    now: datetime,
) -> FollowupTask:
    payload = event.payload or {}
    return FollowupTask(
        company_id=principal.company_id,
        customer_id=_coerce_uuid(payload.get("customer_id")),
        invoice_id=(
            event.aggregate_id
            if event.aggregate_type == DomainAggregateType.INVOICE.value
            else _coerce_uuid(payload.get("invoice_id"))
        ),
        job_id=(
            event.aggregate_id
            if event.aggregate_type == DomainAggregateType.JOB.value
            else _coerce_uuid(payload.get("job_id"))
        ),
        rule_type=rule.rule_type,
        title=rule.title,
        notes=payload.get("title"),
        status=FollowupTaskStatus.OPEN,
        unique_key=key,
        due_at=now + timedelta(days=rule.due_days),
    )


async def _resolve_estimate_sent_followups(
    db: AsyncSession,
    principal: Principal,
    invoice_id: UUID,
    *,
    now: datetime,
) -> None:
    result = await db.execute(
        select(FollowupTask).where(
            FollowupTask.company_id == principal.company_id,
            FollowupTask.status == FollowupTaskStatus.OPEN,
            FollowupTask.rule_type == RULE_ESTIMATE_SENT,
            FollowupTask.invoice_id == invoice_id,
        )
    )
    for task in result.scalars().all():
        task.status = FollowupTaskStatus.RESOLVED
        task.resolved_at = now
        task.resolved_by_user_id = None
        emit_domain_event(
            db,
            principal,
            aggregate_id=task.id,
            aggregate_type=DomainAggregateType.FOLLOWUP,
            event_type=DomainEventType.FOLLOWUP_RESOLVED,
            payload={
                "followup_id": task.id,
                "reason": "estimate.approved",
                "rule_type": task.rule_type,
            },
            source="automation",
        )


async def _resolve_job_invoice_followups(
    db: AsyncSession,
    principal: Principal,
    job_id: UUID | None,
    *,
    now: datetime,
    open_by_key: dict[str, FollowupTask],
) -> None:
    """Auto-resolve a completed job's "create and send invoice" follow-up.

    Runs from the in-memory open-task map so it closes both tasks that were
    committed in an earlier pass and tasks materialized earlier in this same
    scan. The follow-up is satisfied once the invoice for the job is sent.
    """
    if job_id is None:
        return
    for task in list(open_by_key.values()):
        if task.status != FollowupTaskStatus.OPEN:
            continue
        if task.rule_type != RULE_INVOICE_CREATE:
            continue
        if task.job_id != job_id:
            continue
        task.status = FollowupTaskStatus.RESOLVED
        task.resolved_at = now
        task.resolved_by_user_id = None
        emit_domain_event(
            db,
            principal,
            aggregate_id=task.id,
            aggregate_type=DomainAggregateType.FOLLOWUP,
            event_type=DomainEventType.FOLLOWUP_RESOLVED,
            payload={
                "followup_id": task.id,
                "job_id": job_id,
                "reason": "invoice.sent",
                "rule_type": task.rule_type,
            },
            source="automation",
        )


async def deliver_due_followups(
    db: AsyncSession,
    principal: Principal,
    *,
    now: datetime | None = None,
) -> list[FollowupTask]:
    """Deliver each open follow-up the first time it crosses its due date.

    Marks the task with ``delivered_at`` (the watermark) and emits a typed
    ``followup.due`` stream event so downstream notification adapters can react.
    Idempotent: already-delivered tasks are never delivered twice.
    """
    current_time = now or datetime.now(UTC)
    result = await db.execute(
        select(FollowupTask).where(
            FollowupTask.company_id == principal.company_id,
            FollowupTask.status == FollowupTaskStatus.OPEN,
        )
    )
    delivered: list[FollowupTask] = []
    for followup in result.scalars().all():
        if followup.status != FollowupTaskStatus.OPEN:
            continue
        if followup.due_at is None or followup.due_at > current_time:
            continue
        if followup.delivered_at is not None:
            continue
        followup.delivered_at = current_time
        delivered.append(followup)
        emit_domain_event(
            db,
            principal,
            aggregate_id=followup.id,
            aggregate_type=DomainAggregateType.FOLLOWUP,
            correlation_id=followup.id,
            event_type=DomainEventType.FOLLOWUP_DUE,
            payload={
                "customer_id": followup.customer_id,
                "due_at": followup.due_at.isoformat() if followup.due_at else None,
                "invoice_id": followup.invoice_id,
                "job_id": followup.job_id,
                "rule_type": followup.rule_type,
                "title": followup.title,
            },
            source="automation",
        )
    return delivered


def followup_recipient(customer: Customer) -> tuple[MessageChannel, str] | None:
    """Resolve a customer's reachable channel honoring SMS opt-in."""
    if customer.sms_opt_in and customer.phone:
        return MessageChannel.SMS, customer.phone
    if customer.email:
        return MessageChannel.EMAIL, customer.email
    return None


def _followup_message_body(followup: FollowupTask) -> str:
    due = followup.due_at.date() if followup.due_at else "soon"
    return f"{followup.title} — due {due}"


async def send_due_followup_messages(
    db: AsyncSession,
    principal: Principal,
    delivered: Sequence[FollowupTask],
) -> list[SendResult]:
    """Send due follow-up reminders through the messaging port.

    Recipients come from each customer's reachable contact. Skipped when the
    customer is missing or has no reachable channel. The port is disabled by
    default, so this is a no-op until a messaging adapter is configured.
    """
    customer_ids = {task.customer_id for task in delivered if task.customer_id is not None}
    if not customer_ids:
        return []
    result = await db.execute(
        select(Customer).where(
            Customer.company_id == principal.company_id,
            Customer.id.in_(customer_ids),
        )
    )
    customers = {customer.id: customer for customer in result.scalars().all()}
    provider = get_messaging_provider()
    sent: list[SendResult] = []
    for followup in delivered:
        if followup.customer_id is None:
            continue
        customer = customers.get(followup.customer_id)
        if customer is None:
            continue
        recipient = followup_recipient(customer)
        if recipient is None:
            continue
        channel, to = recipient
        sent.append(
            provider.send(
                OutboundMessage(
                    to=to,
                    channel=channel,
                    body=_followup_message_body(followup),
                    company_id=principal.company_id,
                    correlation_id=followup.id,
                    subject=followup.title,
                )
            )
        )
    return sent


async def run_followup_automation(
    db: AsyncSession,
    principal: Principal,
    *,
    now: datetime | None = None,
) -> list[FollowupTask]:
    """One idempotent automation pass: materialize, deliver due, notify.

    Messaging is tied to delivery inside a single pass so each follow-up is
    notified exactly once regardless of whether the API or the sweep triggered
    the pass.
    """
    current_time = now or datetime.now(UTC)
    policy_enabled = await enabled_policy_types(
        db,
        principal,
        [rule.rule_type for rule in AUTOMATION_POLICIES],
    )
    await materialize_pending_followups(
        db,
        principal,
        now=current_time,
        policy_enabled=policy_enabled,
    )
    delivered = await deliver_due_followups(db, principal, now=current_time)
    await send_due_followup_messages(db, principal, delivered)
    return delivered


async def resolve_followup(
    db: AsyncSession,
    principal: Principal,
    followup: FollowupTask,
    *,
    user_id: UUID | None,
    now: datetime | None = None,
) -> FollowupTask:
    """Resolve an open follow-up by an actor; idempotent for already-resolved tasks."""
    if followup.status != FollowupTaskStatus.OPEN:
        return followup
    current_time = now or datetime.now(UTC)
    followup.status = FollowupTaskStatus.RESOLVED
    followup.resolved_at = current_time
    followup.resolved_by_user_id = user_id
    emit_domain_event(
        db,
        principal,
        aggregate_id=followup.id,
        aggregate_type=DomainAggregateType.FOLLOWUP,
        event_type=DomainEventType.FOLLOWUP_RESOLVED,
        payload={
            "resolved_by": user_id,
            "rule_type": followup.rule_type,
            "status": followup.status,
        },
        source="api",
    )
    return followup
