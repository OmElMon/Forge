from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal, require_roles
from app.db.session import get_db
from app.models.company import Company
from app.models.enums import UserRole
from app.schemas.company import CompanyRead, CompanyUpdate
from app.schemas.principal import Principal
from app.services.company import get_workspace_company, update_company_profile

router = APIRouter(prefix="/companies", tags=["workspace"])


@router.get("/me", response_model=CompanyRead)
async def get_workspace(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Company:
    return await get_workspace_company(db, principal.company_id)


@router.patch("/me", response_model=CompanyRead)
async def update_workspace(
    payload: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> Company:
    return await update_company_profile(db, principal, payload)
