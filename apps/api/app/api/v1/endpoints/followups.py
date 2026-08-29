from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import BACK_OFFICE_ROLES, CONFIG_ROLES, get_principal, require_roles
from app.db.session import get_db
from app.models.enums import FollowupTaskStatus
from app.models.followup_task import FollowupTask
from app.schemas.followup import FollowupPolicyRead, FollowupPolicyUpdate, FollowupTaskRead
from app.schemas.principal import Principal
from app.services.audit import record_audit_event
from app.services.automation_policies import load_policy_overrides, set_policy_enabled
from app.services.automation_rules import (
    AUTOMATION_POLICIES,
    resolve_followup,
    rule_by_type,
    run_followup_automation,
)

router = APIRouter(prefix="/followups", tags=["followups"])


def _policy_payload(rule_type: str, enabled: bool) -> FollowupPolicyRead:
    rule = rule_by_type(rule_type)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No automation policy named '{rule_type}'.",
        )
    return FollowupPolicyRead(
        rule_type=rule.rule_type,
        title=rule.title,
        due_days=rule.due_days,
        description=rule.description,
        enabled=enabled,
    )


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


@router.get("/rules", response_model=list[FollowupPolicyRead])
async def list_followup_policies(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[FollowupPolicyRead]:
    overrides = await load_policy_overrides(db, principal)
    return [
        FollowupPolicyRead(
            rule_type=rule.rule_type,
            title=rule.title,
            due_days=rule.due_days,
            description=rule.description,
            enabled=overrides.get(rule.rule_type, True),
        )
        for rule in AUTOMATION_POLICIES
    ]


@router.patch("/rules/{rule_type}", response_model=FollowupPolicyRead)
async def update_followup_policy(
    rule_type: str,
    payload: FollowupPolicyUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*CONFIG_ROLES)),
) -> FollowupPolicyRead:
    if rule_by_type(rule_type) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No automation policy named '{rule_type}'.",
        )
    enabled = await set_policy_enabled(db, principal, rule_type, payload.enabled)
    record_audit_event(
        db,
        principal,
        action="followup.policy_updated",
        context={"rule_type": rule_type, "enabled": enabled},
        resource_id=None,
        resource_type="automation_policy",
    )
    await db.commit()
    return _policy_payload(rule_type, enabled)


@router.post("/{followup_id}/resolve", response_model=FollowupTaskRead)
async def resolve_followup_endpoint(
    followup_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
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
