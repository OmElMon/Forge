from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CONFIG_ROLES, get_principal, require_roles
from app.core.config import settings
from app.core.lockout import LOGIN_LOCKOUT
from app.core.ratelimit import rate_limit_key
from app.db.session import get_db
from app.schemas.auth import (
    EmailVerifyConfirmRequest,
    EmailVerifyRequest,
    LoginRequest,
    LoginResponse,
    MfaChallenge,
    MfaChallengeVerifyRequest,
    MfaConfirmRequest,
    MfaDisableRequest,
    MfaEnrollResult,
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
from app.services.email_verification import (
    confirm_email_verification,
    request_email_verification,
)
from app.services.invites import accept_company_invite
from app.services.mfa import (
    confirm_mfa_enrollment,
    disable_mfa,
    enroll_mfa,
    verify_mfa_challenge,
)
from app.services.password_reset import confirm_password_reset, request_password_reset

router = APIRouter(prefix="/auth", tags=["authentication"])

LOCKOUT_DETAIL = "Too many failed login attempts. Try again later."


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def sign_up(payload: SignUpRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    return await register(db, payload)


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> TokenPair | MfaChallenge:
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
        result = await authenticate(db, payload)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            await LOGIN_LOCKOUT.register_failure(email_key)
            await LOGIN_LOCKOUT.register_failure(ip_key)
        raise
    await LOGIN_LOCKOUT.reset(email_key)
    await LOGIN_LOCKOUT.reset(ip_key)
    return result


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


@router.post(
    "/email-verify", response_model=ResetCodeDelivery, status_code=status.HTTP_202_ACCEPTED
)
async def email_verify_request(
    payload: EmailVerifyRequest, db: AsyncSession = Depends(get_db)
) -> ResetCodeDelivery:
    return await request_email_verification(db, payload)


@router.post("/email-verify/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def email_verify_confirm(
    payload: EmailVerifyConfirmRequest, db: AsyncSession = Depends(get_db)
) -> Response:
    await confirm_email_verification(db, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


@router.post("/mfa/verify", response_model=TokenPair)
async def mfa_verify(
    payload: MfaChallengeVerifyRequest, db: AsyncSession = Depends(get_db)
) -> TokenPair:
    return await verify_mfa_challenge(db, payload)


@router.post("/mfa/enroll", response_model=MfaEnrollResult, status_code=status.HTTP_201_CREATED)
async def mfa_enroll(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*CONFIG_ROLES)),
) -> MfaEnrollResult:
    return await enroll_mfa(db, principal)


@router.post("/mfa/enroll/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_enroll_confirm(
    payload: MfaConfirmRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*CONFIG_ROLES)),
) -> Response:
    await confirm_mfa_enrollment(db, principal, payload.code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_disable(
    payload: MfaDisableRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*CONFIG_ROLES)),
) -> Response:
    await disable_mfa(db, principal, payload.code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
