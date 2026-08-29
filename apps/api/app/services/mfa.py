import re
from secrets import token_urlsafe
from uuid import UUID

import jwt
import pyotp
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    decode_token,
    hash_reset_pin,
    verify_reset_pin,
)
from app.models.company import Company
from app.models.enums import CompanyStatus, UserRole
from app.models.membership import Membership
from app.models.mfa_setting import MfaSetting
from app.models.user import User
from app.schemas.auth import (
    MfaChallengeVerifyRequest,
    MfaEnrollResult,
    TokenPair,
)
from app.schemas.principal import Principal
from app.services.audit import record_audit_event
from app.services.auth import issue_tokens

RECOVERY_CODE_COUNT = 8
RECOVERY_PATTERN = re.compile(r"^recovery:(?P<index>\d+)$")


def generate_recovery_codes(count: int = RECOVERY_CODE_COUNT) -> list[str]:
    """Return fresh single-use recovery codes (shown once at enrollment)."""
    return [token_urlsafe(8) for _ in range(count)]


def verify_mfa_code(setting: MfaSetting, code: str) -> str | None:
    """Validate a TOTP or recovery code against a setting.

    Returns ``"totp"`` or ``"recovery:{index}"`` on success, else ``None``.
    """
    if pyotp.TOTP(setting.secret).verify(code, valid_window=1):
        return "totp"
    for index, encoded in enumerate(setting.recovery_hashes or []):
        if verify_reset_pin(code, encoded):
            return f"recovery:{index}"
    return None


async def enroll_mfa(db: AsyncSession, principal: Principal) -> MfaEnrollResult:
    """Create a pending TOTP enrollment, returning the one-time secret + codes."""
    secret = pyotp.random_base32()
    recovery_codes = generate_recovery_codes()
    existing = await db.scalar(select(MfaSetting).where(MfaSetting.user_id == principal.user_id))
    if existing is not None:
        await db.delete(existing)
        await db.flush()
    db.add(
        MfaSetting(
            user_id=principal.user_id,
            secret=secret,
            recovery_hashes=[hash_reset_pin(code) for code in recovery_codes],
            confirmed=False,
        )
    )
    record_audit_event(
        db,
        principal,
        action="auth.mfa.enrolled",
        resource_type="mfa_settings",
        resource_id=principal.user_id,
        context={"confirmed": False},
    )
    await db.commit()
    provisioning_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=str(principal.email), issuer_name=settings.app_name
    )
    return MfaEnrollResult(
        secret=secret, provisioning_uri=provisioning_uri, recovery_codes=recovery_codes
    )


async def confirm_mfa_enrollment(db: AsyncSession, principal: Principal, code: str) -> None:
    """Activate a pending enrollment once a TOTP code proves the user scanned it."""
    setting = await db.scalar(select(MfaSetting).where(MfaSetting.user_id == principal.user_id))
    if setting is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending enrollment")
    if not pyotp.TOTP(setting.secret).verify(code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")
    setting.confirmed = True
    record_audit_event(
        db,
        principal,
        action="auth.mfa.enabled",
        resource_type="mfa_settings",
        resource_id=principal.user_id,
        context={"confirmed": True},
    )
    await db.commit()


async def disable_mfa(db: AsyncSession, principal: Principal, code: str) -> None:
    """Disable MFA after a valid TOTP or recovery code re-proves the operator."""
    setting = await db.scalar(select(MfaSetting).where(MfaSetting.user_id == principal.user_id))
    if setting is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA not enabled")
    if verify_mfa_code(setting, code) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")
    await db.delete(setting)
    record_audit_event(
        db,
        principal,
        action="auth.mfa.disabled",
        resource_type="mfa_settings",
        resource_id=principal.user_id,
    )
    await db.commit()


async def verify_mfa_challenge(db: AsyncSession, payload: MfaChallengeVerifyRequest) -> TokenPair:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA challenge"
    )
    try:
        claims = decode_token(payload.mfa_session)
        if claims.get("type") != "mfa":
            raise unauthorized
        user_id = UUID(claims["sub"])
        company_id = UUID(claims["company_id"])
    except HTTPException:
        raise
    except (jwt.PyJWTError, ValueError, KeyError, TypeError) as exc:
        raise unauthorized from exc

    user = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        raise unauthorized
    setting = await db.scalar(select(MfaSetting).where(MfaSetting.user_id == user_id))
    if setting is None or not setting.confirmed:
        raise unauthorized
    match = verify_mfa_code(setting, payload.code)
    if match is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")
    membership = await db.scalar(
        select(Membership).where(Membership.user_id == user_id, Membership.company_id == company_id)
    )
    if membership is None:
        raise unauthorized
    company = await db.scalar(select(Company).where(Company.id == company_id))
    if company is None:
        raise unauthorized
    if company.status == CompanyStatus.SUSPENDED and membership.role != UserRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace suspended")

    recovery_used = False
    if (m := RECOVERY_PATTERN.match(match)) is not None:
        recovery_used = True
        index = int(m.group("index"))
        hashes = list(setting.recovery_hashes or [])
        if index < len(hashes):
            hashes.pop(index)
            setting.recovery_hashes = hashes

    tokens = await issue_tokens(db, user_id, company_id)
    record_audit_event(
        db,
        Principal(
            user_id=user_id,
            company_id=company_id,
            email=user.email,
            full_name=user.full_name,
            company_name=company.name,
            role=membership.role,
            email_verified=bool(user.email_verified),
        ),
        action="auth.mfa.verified",
        resource_type="mfa_settings",
        resource_id=user_id,
        context={"recovery_used": recovery_used},
    )
    await db.commit()
    return tokens
