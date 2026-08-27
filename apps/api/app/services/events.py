from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.domain_event import DomainEvent
from app.models.enums import DomainAggregateType, DomainEventType
from app.schemas.principal import Principal
from app.services.audit import json_safe_context


def emit_domain_event(
    db: AsyncSession,
    principal: Principal,
    *,
    aggregate_id: UUID,
    aggregate_type: DomainAggregateType,
    correlation_id: UUID | None = None,
    event_type: DomainEventType,
    payload: dict[str, Any] | None = None,
    source: str = "api",
) -> DomainEvent:
    """Append a typed, tenant-scoped domain event to the current session."""
    event = DomainEvent(
        actor_user_id=principal.user_id,
        aggregate_id=aggregate_id,
        aggregate_type=aggregate_type.value,
        company_id=principal.company_id,
        correlation_id=correlation_id,
        event_type=event_type.value,
        payload=json_safe_context(payload or {}),
        source=source,
    )
    db.add(event)
    return event
