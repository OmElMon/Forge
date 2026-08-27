from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.domain_event import DomainEvent
from app.models.enums import (
    DomainAggregateType,
    DomainEventType,
    FollowupTaskStatus,
    InvoiceType,
)
from app.models.followup_task import FollowupTask
from app.schemas.principal import Principal
from app.services.events import emit_domain_event

LOOKBACK_DAYS = 90
ESTIMATE_FOLLOWUP_DUE_DAYS = 5
ESTIMATE_CONVERT_DUE_DAYS = 3
INVOICE_PAYMENT_FOLLOWUP_DAYS = 14

RULE_ESTIMATE_SENT = "estimate.sent"
RULE_ESTIMATE_APPROVED = "estimate.approved"
RULE_INVOICE_SENT = "invoice.sent"


@dataclass(frozen=True)
class FollowupRule:
    rule_type: str
    title: str
    due_days: int


ESTIMATE_SENT_RULE = FollowupRule(
    rule_type=RULE_ESTIMATE_SENT,
    title="Estimate awaiting follow-up",
    due_days=ESTIMATE_FOLLOWUP_DUE_DAYS,
)
ESTIMATE_APPROVED_RULE = FollowupRule(
    rule_type=RULE_ESTIMATE_APPROVED,
    title="Estimate ready to convert",
    due_days=ESTIMATE_CONVERT_DUE_DAYS,
)
INVOICE_SENT_RULE = FollowupRule(
    rule_type=RULE_INVOICE_SENT,
    title="Invoice awaiting payment",
    due_days=INVOICE_PAYMENT_FOLLOWUP_DAYS,
)

ROUTED_EVENT_TYPES = {
    DomainEventType.INVOICE_SENT.value,
    DomainEventType.ESTIMATE_APPROVED.value,
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
) -> list[FollowupTask]:
    """Turn operational domain events into follow-up tasks (idempotent).

    Scans the tenant's recent event stream for routed event types and creates an
    open follow-up for each new ``(rule, aggregate)`` pair. Approval of an
    estimate also resolves its earlier "awaiting follow-up" task. Because the
    partial unique index rejects duplicate open tasks, repeated scans are safe.
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
        job_id=_coerce_uuid(payload.get("job_id")),
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
