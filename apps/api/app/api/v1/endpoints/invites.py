from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.schemas.invite import InviteCreate, InvitePreview, InviteRead
from app.schemas.principal import Principal
from app.services.invites import (
    cancel_company_invite,
    create_company_invite,
    list_company_invites,
    preview_invite,
    resend_company_invite,
)

router = APIRouter(prefix="/invites", tags=["invites"])


@router.get("", response_model=list[InviteRead])
async def list_invites(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[InviteRead]:
    return await list_company_invites(db, principal)


@router.post("", response_model=InviteRead, status_code=status.HTTP_201_CREATED)
async def invite_team_member(
    payload: InviteCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> InviteRead:
    return await create_company_invite(db, principal, payload)


@router.get("/preview", response_model=InvitePreview)
async def invite_preview(
    token: str = Query(min_length=20),
    db: AsyncSession = Depends(get_db),
) -> InvitePreview:
    return await preview_invite(db, token)


@router.post("/{invite_id}/cancel", response_model=InviteRead)
async def cancel_invite(
    invite_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> InviteRead:
    return await cancel_company_invite(db, principal, invite_id)


@router.post("/{invite_id}/resend", response_model=InviteRead)
async def resend_invite(
    invite_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> InviteRead:
    return await resend_company_invite(db, principal, invite_id)
