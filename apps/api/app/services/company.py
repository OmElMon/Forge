from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.enums import UserRole
from app.schemas.company import CompanyUpdate
from app.schemas.principal import Principal
from app.services.audit import record_audit_event


def _require_manager(principal: Principal) -> None:
    if principal.role not in (UserRole.OWNER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can change workspace settings",
        )


async def get_workspace_company(db: AsyncSession, company_id) -> Company:
    company = await db.get(Company, company_id)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    return company


async def update_company_profile(
    db: AsyncSession,
    principal: Principal,
    payload: CompanyUpdate,
    *,
    company: Company | None = None,
) -> Company:
    _require_manager(principal)
    company = company or await get_workspace_company(db, principal.company_id)

    changed: list[str] = []
    if payload.name is not None and payload.name != company.name:
        company.name = payload.name
        changed.append("name")
    if payload.timezone is not None and payload.timezone != company.timezone:
        company.timezone = payload.timezone
        changed.append("timezone")
    if payload.service_area is not None and payload.service_area != company.service_area:
        company.service_area = payload.service_area
        changed.append("service_area")
    if payload.default_trade is not None and payload.default_trade != company.default_trade:
        company.default_trade = payload.default_trade
        changed.append("default_trade")
    if payload.notification_prefs is not None and (
        payload.notification_prefs != company.notification_prefs
    ):
        company.notification_prefs = payload.notification_prefs
        changed.append("notification_prefs")

    if changed:
        record_audit_event(
            db,
            principal,
            action="company.profile.updated",
            resource_type="company",
            resource_id=company.id,
            context={"fields": changed},
        )
        await db.flush()
        await db.commit()
    return company
