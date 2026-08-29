from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.core.config import settings
from app.core.lockout import LOGIN_LOCKOUT
from app.core.ratelimit import rate_limit_key
from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshRequest,
    ResetCodeDelivery,
    SignUpRequest,
    TokenPair,
)
from app.schemas.invite import InviteAcceptRequest
from app.schemas.principal import Principal
from app.services.auth import authenticate, register, revoke_refresh_token, rotate_refresh_token
from app.services.invites import accept_company_invite
from app.services.password_reset import confirm_password_reset, request_password_reset

router = APIRouter(prefix="/auth", tags=["authentication"])

LOCKOUT_DETAIL = "Too many failed login attempts. Try again later."


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def sign_up(payload: SignUpRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    return await register(db, payload)


@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> TokenPair:
    if not settings.account_lockout_enabled:
        return await authenticate(db, payload)
    email_key = f"email:{payload.email.lower()}"
    ip_key = f"ip:{rate_limit_key(request)}"
    for key in (email_key, ip_key):
        blocked, retry_after = await LOGIN_LOCKOUT.check(key)
        if blocked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=LOCKOUT_DETAIL,
                headers={"Retry-After": str(int(retry_after))},
            )
    try:
        tokens = await authenticate(db, payload)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            await LOGIN_LOCKOUT.register_failure(email_key)
            await LOGIN_LOCKOUT.register_failure(ip_key)
        raise
    await LOGIN_LOCKOUT.reset(email_key)
    await LOGIN_LOCKOUT.reset(ip_key)
    return tokens


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    return await rotate_refresh_token(db, payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> Response:
    await revoke_refresh_token(db, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=Principal)
async def me(principal: Principal = Depends(get_principal)) -> Principal:
    return principal


@router.post(
    "/password-reset", response_model=ResetCodeDelivery, status_code=status.HTTP_202_ACCEPTED
)
async def password_reset(
    payload: PasswordResetRequest, db: AsyncSession = Depends(get_db)
) -> ResetCodeDelivery:
    return await request_password_reset(db, payload)


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_confirm(
    payload: PasswordResetConfirmRequest, db: AsyncSession = Depends(get_db)
) -> Response:
    await confirm_password_reset(db, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/invites/accept", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def invite_accept(
    payload: InviteAcceptRequest, db: AsyncSession = Depends(get_db)
) -> TokenPair:
    return await accept_company_invite(db, payload)
