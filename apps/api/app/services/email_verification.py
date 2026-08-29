from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import create_email_verification_token, fingerprint_token
from app.models.audit import AuditLog
from app.models.email_verification import EmailVerification
from app.models.membership import Membership
from app.models.user import User
from app.schemas.auth import EmailVerifyConfirmRequest, EmailVerifyRequest, ResetCodeDelivery
from app.services.integrations import MessageChannel, OutboundMessage, get_messaging_provider

LOCAL_PROVIDERS = ("disabled", "recording")


async def request_email_verification(
    db: AsyncSession, payload: EmailVerifyRequest
) -> ResetCodeDelivery:
    ttl = timedelta(minutes=settings.email_verification_expire_minutes)
    user = await db.scalar(
        select(User)
        .where(User.email == payload.email.lower(), User.is_active.is_(True))
        .options(selectinload(User.memberships))
    )
    if not user or not user.memberships:
        # Never reveal whether an account exists.
        return ResetCodeDelivery(
            status="sent", channel="email", code_valid_seconds=int(ttl.total_seconds())
        )

    await db.execute(
        update(EmailVerification)
        .where(
            EmailVerification.user_id == user.id,
            EmailVerification.consumed_at.is_(None),
            EmailVerification.expires_at > datetime.now(UTC),
        )
        .values(consumed_at=datetime.now(UTC))
    )
    await db.flush()

    token, fingerprint = create_email_verification_token()
    expires_at = datetime.now(UTC) + ttl
    db.add(
        EmailVerification(
            user_id=user.id,
            token_fingerprint=fingerprint,
            expires_at=expires_at,
        )
    )
    await db.flush()

    verify_url = f"{settings.public_base_url}/verify-email?token={token}"
    provider = get_messaging_provider()
    delivery = provider.send(
        OutboundMessage(
            to=user.email,
            channel=MessageChannel.EMAIL,
            subject="Verify your CrewPilot OS email",
            body=f"Verify your CrewPilot OS email address at {verify_url}\n\n"
            "Your one-time verification code is:\n\n"
            f"{token}\n\n"
            "This code can only be used once.",
            company_id=user.memberships[0].company_id,
            correlation_id=uuid4(),
        )
    )
    await db.commit()

    is_local = settings.messaging_provider in LOCAL_PROVIDERS
    return ResetCodeDelivery(
        status="queued" if delivery.disabled else "sent",
        channel="email",
        code_valid_seconds=int(ttl.total_seconds()),
        dev_code=token if is_local else None,
    )


async def confirm_email_verification(db: AsyncSession, payload: EmailVerifyConfirmRequest) -> None:
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This verification code is invalid or has already been used.",
    )
    row = await db.scalar(
        select(EmailVerification).where(
            EmailVerification.token_fingerprint == fingerprint_token(payload.token)
        )
    )
    if not row:
        raise invalid

    now = datetime.now(UTC)
    if row.consumed_at is not None or row.expires_at <= now:
        raise invalid

    user = await db.get(User, row.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is not active."
        )
    membership = await db.scalar(
        select(Membership.company_id).where(Membership.user_id == user.id).limit(1)
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No company access.")

    user.email_verified = True
    user.email_verified_at = now
    row.consumed_at = now
    db.add(
        AuditLog(
            action="auth.email_verified",
            actor_user_id=user.id,
            company_id=membership,
            context={},
            resource_type="user",
            resource_id=user.id,
        )
    )
    await db.commit()
