from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.company import Company
from app.models.enums import UserRole
from app.schemas.admin import AdminCompanyOverview
from app.schemas.company import CompanyRead, CompanyStatusUpdate
from app.schemas.principal import Principal
from app.services.admin import get_admin_overview, set_company_status

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/company", response_model=AdminCompanyOverview)
async def admin_company_overview(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(UserRole.OWNER)),
) -> AdminCompanyOverview:
    company, member_count, open_invites, audit_total = await get_admin_overview(db, principal)
    return AdminCompanyOverview(
        company=company,
        member_count=member_count,
        open_invites=open_invites,
        audit_total=audit_total,
    )


@router.patch("/company/status", response_model=CompanyRead)
async def admin_company_status(
    payload: CompanyStatusUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(UserRole.OWNER)),
) -> Company:
    return await set_company_status(db, principal, payload.status, company=None)
