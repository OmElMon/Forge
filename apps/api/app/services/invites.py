from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_password_reset_token, fingerprint_token, hash_password
from app.models.audit import AuditLog
from app.models.company import Company
from app.models.enums import UserRole
from app.models.invite import Invite
from app.models.membership import Membership
from app.models.user import User
from app.schemas.auth import TokenPair
from app.schemas.invite import InviteAcceptRequest, InviteCreate, InvitePreview, InviteRead
from app.schemas.membership import MembershipRead
from app.schemas.principal import Principal
from app.services.audit import json_safe_context, record_audit_event
from app.services.auth import issue_tokens
from app.services.integrations import MessageChannel, OutboundMessage, get_messaging_provider

INVITE_MANAGER_ROLES = (UserRole.OWNER, UserRole.ADMIN)
LOCAL_PROVIDERS = ("disabled", "recording")


def is_local_provider() -> bool:
    return settings.messaging_provider in LOCAL_PROVIDERS


def invite_status(invite: Invite) -> str:
    if invite.accepted_at is not None:
        return "accepted"
    if invite.canceled_at is not None:
        return "canceled"
    if invite.expires_at <= datetime.now(UTC):
        return "expired"
    return "pending"


def build_invite_read(
    invite: Invite, invited_by: str | None, accept_link: str | None = None
) -> InviteRead:
    return InviteRead(
        id=invite.id,
        email=invite.email,
        full_name=invite.full_name,
        role=invite.role,
        status=invite_status(invite),
        invited_by=invited_by,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
        accept_link=accept_link,
    )


def require_invite_manager(principal: Principal) -> None:
    if principal.role not in INVITE_MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can manage invites.",
        )


async def list_company_invites(db: AsyncSession, principal: Principal) -> list[InviteRead]:
    result = await db.execute(
        select(Invite, User.full_name)
        .join(User, User.id == Invite.user_id, isouter=True)
        .where(Invite.company_id == principal.company_id)
        .order_by(Invite.created_at.desc())
    )
    return [build_invite_read(invite, invited_by) for invite, invited_by in result.all()]


async def list_company_members(db: AsyncSession, principal: Principal) -> list[MembershipRead]:
    result = await db.execute(
        select(Membership, User.email, User.full_name)
        .join(User, User.id == Membership.user_id)
        .where(Membership.company_id == principal.company_id)
        .order_by(User.full_name.asc())
    )
    return [
        MembershipRead(
            id=membership.id,
            email=email,
            full_name=full_name,
            role=membership.role,
            joined_at=membership.created_at,
        )
        for membership, email, full_name in result.all()
    ]


async def create_company_invite(
    db: AsyncSession, principal: Principal, payload: InviteCreate
) -> InviteRead:
    require_invite_manager(principal)
    email = payload.email.lower()
    if principal.role != UserRole.OWNER and payload.role in (
        UserRole.OWNER,
        UserRole.ADMIN,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the workspace owner can invite owners or admins.",
        )

    existing = await db.scalar(select(User).where(User.email == email, User.is_active.is_(True)))
    if existing is not None:
        membership = await db.scalar(
            select(Membership.id).where(
                Membership.company_id == principal.company_id,
                Membership.user_id == existing.id,
            )
        )
        if membership is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is already a member of the workspace.",
            )

    await db.execute(
        update(Invite)
        .where(
            Invite.company_id == principal.company_id,
            Invite.email == email,
            Invite.accepted_at.is_(None),
            Invite.canceled_at.is_(None),
        )
        .values(canceled_at=datetime.now(UTC))
    )
    await db.flush()

    token, fingerprint = create_password_reset_token()
    now = datetime.now(UTC)
    db.add(
        Invite(
            company_id=principal.company_id,
            user_id=principal.user_id,
            email=email,
            full_name=payload.full_name.strip(),
            role=payload.role,
            token_fingerprint=fingerprint,
            expires_at=now + timedelta(days=settings.invite_expire_days),
        )
    )
    await db.flush()

    invite = await db.scalar(
        select(Invite).where(
            Invite.company_id == principal.company_id,
            Invite.email == email,
            Invite.accepted_at.is_(None),
            Invite.canceled_at.is_(None),
        )
    )
    assert invite is not None

    company = await db.get(Company, principal.company_id)
    company_name = company.name if company else "CrewPilot OS"
    accept_url = f"{settings.public_base_url}/accept-invite?token={token}"
    provider = get_messaging_provider()
    provider.send(
        OutboundMessage(
            to=email,
            channel=MessageChannel.EMAIL,
            subject=f"You've been invited to {company_name}",
            body=f"{payload.full_name.strip()} — you've been invited to {company_name} "
            "as a member of the CrewPilot OS workspace.\n\n"
            f"Accept the invite here:\n{accept_url}\n\n"
            f"The invite link works until {invite.expires_at.isoformat()} and can only be "
            "used once. Code:\n\n"
            f"{token}\n\n"
            "If you weren't expecting this invite, you can ignore this email.",
            company_id=principal.company_id,
            correlation_id=uuid4(),
        )
    )
    record_audit_event(
        db,
        principal,
        action="invite.created",
        resource_type="invite",
        resource_id=invite.id,
        context={"email": email, "role": payload.role, "expires_at": invite.expires_at},
    )
    await db.commit()

    return build_invite_read(
        invite, principal.full_name, accept_link=accept_url if is_local_provider() else None
    )


async def cancel_company_invite(
    db: AsyncSession, principal: Principal, invite_id: UUID
) -> InviteRead:
    require_invite_manager(principal)
    row = (
        await db.execute(
            select(Invite, User.full_name)
            .join(User, User.id == Invite.user_id, isouter=True)
            .where(
                Invite.id == invite_id,
                Invite.company_id == principal.company_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")
    invite, invited_by = row
    if invite.accepted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This invite was already accepted."
        )
    invite.canceled_at = datetime.now(UTC)
    record_audit_event(
        db,
        principal,
        action="invite.canceled",
        resource_type="invite",
        resource_id=invite.id,
        context={"email": invite.email},
    )
    await db.commit()
    return build_invite_read(invite, invited_by)


async def resend_company_invite(
    db: AsyncSession, principal: Principal, invite_id: UUID
) -> InviteRead:
    require_invite_manager(principal)
    row = (
        await db.execute(
            select(Invite, User.full_name)
            .join(User, User.id == Invite.user_id, isouter=True)
            .where(
                Invite.id == invite_id,
                Invite.company_id == principal.company_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found.")
    invite, invited_by = row
    if invite.accepted_at is not None or invite.canceled_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This invite is no longer active.",
        )

    token, fingerprint = create_password_reset_token()
    invite.token_fingerprint = fingerprint
    invite.expires_at = datetime.now(UTC) + timedelta(days=settings.invite_expire_days)

    company = await db.get(Company, invite.company_id)
    company_name = company.name if company else "CrewPilot OS"
    accept_url = f"{settings.public_base_url}/accept-invite?token={token}"
    provider = get_messaging_provider()
    provider.send(
        OutboundMessage(
            to=invite.email,
            channel=MessageChannel.EMAIL,
            subject=f"You've been invited to {company_name}",
            body=f"Here's a fresh invite to {company_name} as a member of the CrewPilot OS "
            "workspace.\n\n"
            f"Accept the invite here:\n{accept_url}\n\n"
            f"The invite link works until {invite.expires_at.isoformat()} and can only be "
            "used once. Code:\n\n"
            f"{token}\n\n"
            "If you weren't expecting this invite, you can ignore this email.",
            company_id=principal.company_id,
            correlation_id=uuid4(),
        )
    )
    record_audit_event(
        db,
        principal,
        action="invite.resend",
        resource_type="invite",
        resource_id=invite.id,
        context={"email": invite.email, "expires_at": invite.expires_at},
    )
    await db.commit()
    return build_invite_read(
        invite,
        invited_by,
        accept_link=accept_url if is_local_provider() else None,
    )


async def preview_invite(db: AsyncSession, token: str) -> InvitePreview:
    invite = await db.scalar(
        select(Invite).where(Invite.token_fingerprint == fingerprint_token(token))
    )
    now = datetime.now(UTC)
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This invite is invalid or has already been used.",
    )
    if invite is None or invite.accepted_at is not None or invite.canceled_at is not None:
        raise invalid
    if invite.expires_at <= now:
        raise invalid
    company = await db.get(Company, invite.company_id)
    return InvitePreview(
        email=invite.email,
        full_name=invite.full_name,
        role=invite.role,
        company_name=company.name if company else "CrewPilot OS",
    )


async def accept_company_invite(db: AsyncSession, payload: InviteAcceptRequest) -> TokenPair:
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This invite is invalid or has already been used.",
    )
    invite = await db.scalar(
        select(Invite).where(Invite.token_fingerprint == fingerprint_token(payload.token))
    )
    if invite is None or invite.accepted_at is not None or invite.canceled_at is not None:
        raise invalid
    if invite.expires_at <= datetime.now(UTC):
        raise invalid

    user = await db.scalar(select(User).where(User.email == invite.email, User.is_active.is_(True)))
    if user is not None:
        membership = await db.scalar(
            select(Membership.id).where(
                Membership.company_id == invite.company_id,
                Membership.user_id == user.id,
            )
        )
        if membership is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are already a member of this workspace.",
            )
    else:
        user = User(
            email=invite.email,
            full_name=invite.full_name,
            password_hash=hash_password(payload.password),
        )
        db.add(user)
        await db.flush()

    db.add(
        Membership(
            company_id=invite.company_id,
            user_id=user.id,
            role=invite.role,
        )
    )
    invite.accepted_at = datetime.now(UTC)
    db.add(
        AuditLog(
            action="invite.accepted",
            actor_user_id=user.id,
            company_id=invite.company_id,
            context=json_safe_context({"email": invite.email, "role": invite.role}),
            resource_type="invite",
            resource_id=invite.id,
        )
    )
    tokens = await issue_tokens(db, user.id, invite.company_id)
    await db.commit()
    return tokens
