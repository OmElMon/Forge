from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.enums import FollowupTaskStatus
from app.models.followup_task import FollowupTask
from app.schemas.followup import FollowupTaskRead
from app.schemas.principal import Principal
from app.services.audit import record_audit_event
from app.services.automation_rules import resolve_followup, run_followup_automation

router = APIRouter(prefix="/followups", tags=["followups"])


@router.get("", response_model=list[FollowupTaskRead])
async def list_followups(
    status_filter: FollowupTaskStatus | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[FollowupTask]:
    # Run the automation pass (materialize + deliver due + notify via the
    # messaging port) so the queue and followup.due delivery stay current whether
    # or not a background worker is running.
    await run_followup_automation(db, principal)
    await db.commit()
    filters = [FollowupTask.company_id == principal.company_id]
    if status_filter is not None:
        filters.append(FollowupTask.status == status_filter)
    result = await db.execute(
        select(FollowupTask)
        .where(*filters)
        .order_by(FollowupTask.due_at.asc().nullslast(), FollowupTask.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{followup_id}/resolve", response_model=FollowupTaskRead)
async def resolve_followup_endpoint(
    followup_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> FollowupTask:
    result = await db.execute(
        select(FollowupTask).where(
            FollowupTask.id == followup_id,
            FollowupTask.company_id == principal.company_id,
        )
    )
    followup = result.scalar_one_or_none()
    if followup is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found.")
    await resolve_followup(db, principal, followup, user_id=principal.user_id)
    record_audit_event(
        db,
        principal,
        action="followup.resolved",
        context={"rule_type": followup.rule_type},
        resource_id=followup.id,
        resource_type="followup",
    )
    await db.commit()
    await db.refresh(followup)
    return followup
