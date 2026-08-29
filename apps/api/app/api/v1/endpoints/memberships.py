from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.schemas.membership import MembershipRead
from app.schemas.principal import Principal
from app.services.invites import list_company_members

router = APIRouter(prefix="/memberships", tags=["memberships"])


@router.get("", response_model=list[MembershipRead])
async def list_members(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[MembershipRead]:
    return await list_company_members(db, principal)
