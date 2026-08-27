from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.domain_event import DomainEvent
from app.schemas.domain_event import DomainEventRead
from app.schemas.principal import Principal

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[DomainEventRead])
async def list_domain_events(
    aggregate_type: str | None = Query(default=None, max_length=80),
    aggregate_id: UUID | None = Query(default=None),
    event_type: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[DomainEvent]:
    query = select(DomainEvent).where(DomainEvent.company_id == principal.company_id)
    if aggregate_type is not None:
        query = query.where(DomainEvent.aggregate_type == aggregate_type)
    if aggregate_id is not None:
        query = query.where(DomainEvent.aggregate_id == aggregate_id)
    if event_type is not None:
        query = query.where(DomainEvent.event_type == event_type)

    result = await db.execute(query.order_by(DomainEvent.occurred_at.desc()).limit(limit))
    return list(result.scalars().all())
