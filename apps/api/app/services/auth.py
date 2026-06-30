import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import (
    create_token,
    decode_token,
    fingerprint_token,
    hash_password,
    verify_password,
)
from app.models.company import Company
from app.models.enums import UserRole
from app.models.membership import Membership
from app.models.session import RefreshSession
from app.models.user import User
from app.schemas.auth import LoginRequest, SignUpRequest, TokenPair


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:70] or "company"


async def _issue_tokens(db: AsyncSession, user_id: UUID, company_id: UUID) -> TokenPair:
    access, _, _ = create_token(
        subject=user_id,
        company_id=company_id,
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    refresh, token_id, expires_at = create_token(
        subject=user_id,
        company_id=company_id,
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(
        RefreshSession(
            user_id=user_id,
            company_id=company_id,
            token_id=token_id,
            token_fingerprint=fingerprint_token(refresh),
            expires_at=expires_at,
        )
    )
    await db.flush()
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


async def register(db: AsyncSession, payload: SignUpRequest) -> TokenPair:
    email = payload.email.lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    base_slug = _slugify(payload.company_name)
    slug = base_slug
    counter = 1
    while await db.scalar(select(Company.id).where(Company.slug == slug)):
        counter += 1
        slug = f"{base_slug[:65]}-{counter}"

    company = Company(name=payload.company_name.strip(), slug=slug)
    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add_all([company, user])
    await db.flush()
    db.add(Membership(company_id=company.id, user_id=user.id, role=UserRole.OWNER))
    tokens = await _issue_tokens(db, user.id, company.id)
    await db.commit()
    return tokens


async def authenticate(db: AsyncSession, payload: LoginRequest) -> TokenPair:
    result = await db.execute(
        select(User)
        .where(User.email == payload.email.lower(), User.is_active.is_(True))
        .options(selectinload(User.memberships))
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.memberships:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No company access")
    tokens = await _issue_tokens(db, user.id, user.memberships[0].company_id)
    await db.commit()
    return tokens


async def rotate_refresh_token(db: AsyncSession, token: str) -> TokenPair:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise unauthorized
        token_id = UUID(payload["jti"])
        user_id = UUID(payload["sub"])
        company_id = UUID(payload["company_id"])
    except (ValueError, KeyError, TypeError):
        raise unauthorized from None
    except Exception as exc:
        raise unauthorized from exc

    session = await db.scalar(
        select(RefreshSession).where(
            RefreshSession.token_id == token_id,
            RefreshSession.token_fingerprint == fingerprint_token(token),
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > datetime.now(UTC),
        )
    )
    if not session:
        raise unauthorized
    session.revoked_at = datetime.now(UTC)
    tokens = await _issue_tokens(db, user_id, company_id)
    await db.commit()
    return tokens
