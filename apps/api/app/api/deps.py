from collections.abc import Callable
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.company import Company
from app.models.enums import UserRole
from app.models.membership import Membership
from app.models.user import User
from app.schemas.principal import Principal

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_principal(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> Principal:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        claims = decode_token(token)
        if claims.get("type") != "access":
            raise credentials_error
        user_id = UUID(claims["sub"])
        company_id = UUID(claims["company_id"])
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        raise credentials_error from None

    row = (
        await db.execute(
            select(User, Company, Membership.role)
            .join(Membership, Membership.user_id == User.id)
            .join(Company, Company.id == Membership.company_id)
            .where(
                User.id == user_id,
                User.is_active.is_(True),
                Membership.company_id == company_id,
            )
        )
    ).one_or_none()
    if not row:
        raise credentials_error
    user, company, role = row
    return Principal(
        user_id=user.id,
        company_id=company.id,
        email=user.email,
        full_name=user.full_name,
        company_name=company.name,
        role=role,
    )


def require_roles(*roles: UserRole) -> Callable[..., Principal]:
    async def dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return principal

    return dependency
