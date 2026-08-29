from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.company import Company
from app.models.enums import CompanyStatus, UserRole
from app.models.invite import Invite
from app.models.membership import Membership
from app.schemas.principal import Principal
from app.services.audit import record_audit_event


def require_owner(principal: Principal) -> None:
    if principal.role != UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner-only action",
        )


async def get_admin_overview(
    db: AsyncSession,
    principal: Principal,
    *,
    company: Company | None = None,
) -> tuple[Company, int, int, int]:
    """Owner-only workspace summary: members, open invites, audit entries."""
    require_owner(principal)
    company = company or (await db.get(Company, principal.company_id))
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    member_count = await db.scalar(
        select(func.count())
        .select_from(Membership)
        .where(Membership.company_id == principal.company_id)
    )
    open_invites = await db.scalar(
        select(func.count())
        .select_from(Invite)
        .where(
            Invite.company_id == principal.company_id,
            Invite.accepted_at.is_(None),
            Invite.canceled_at.is_(None),
            Invite.expires_at > datetime.now(UTC),
        )
    )
    audit_total = await db.scalar(
        select(func.count())
        .select_from(AuditLog)
        .where(AuditLog.company_id == principal.company_id)
    )
    return company, int(member_count or 0), int(open_invites or 0), int(audit_total or 0)


async def set_company_status(
    db: AsyncSession,
    principal: Principal,
    new_status: CompanyStatus,
    *,
    company: Company | None = None,
) -> Company:
    """Owner-only safe suspension/reactivation of a workspace."""
    require_owner(principal)
    company = company or (await db.get(Company, principal.company_id))
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    if company.status == new_status:
        return company

    suspended = new_status == CompanyStatus.SUSPENDED
    company.status = new_status
    record_audit_event(
        db,
        principal,
        action="admin.company.suspended" if suspended else "admin.company.reactivated",
        resource_type="company",
        resource_id=company.id,
        context={},
    )
    await db.flush()
    await db.commit()
    return company
