import asyncio
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.api.deps import get_principal
from app.core.security import create_token, hash_password
from app.models.company import Company
from app.models.enums import CompanyStatus, UserRole
from app.models.membership import Membership
from app.models.session import RefreshSession
from app.models.user import User
from app.schemas.auth import LoginRequest
from app.services.auth import authenticate

PASSWORD = "a-very-strong-password"


class FakeResult:
    def __init__(self, rows: list[object] | None = None) -> None:
        self.rows = rows or []

    def scalar_one_or_none(self) -> object:
        return self.rows[0] if self.rows else None

    def one_or_none(self) -> object:
        return self.rows[0] if self.rows else None


def make_token(user_id: UUID, company_id: UUID) -> str:
    token, _, _ = create_token(
        subject=user_id,
        company_id=company_id,
        token_type="access",
        expires_delta=timedelta(minutes=5),
    )
    return token


def make_user_and_membership(
    *, company_id: UUID, role: UserRole = UserRole.TECHNICIAN
) -> tuple[User, Membership]:
    user = User(
        email="member@example.com",
        full_name="Morgan Member",
        password_hash=hash_password(PASSWORD),
        is_active=True,
    )
    membership = Membership(company_id=company_id, user_id=uuid4(), role=role)
    user.memberships = [membership]
    return user, membership


class FakePrincipalSession:
    """Session that answers the get_principal join query."""

    def __init__(self, rows: list[object] | None = None) -> None:
        self.rows = rows or []

    async def execute(self, _statement: object) -> FakeResult:
        return FakeResult(self.rows)


def test_principal_denied_when_workspace_suspended_for_member() -> None:
    company_id = uuid4()
    user_id = uuid4()
    company = Company(name="Ace Plumbing", slug="ace-plumbing")
    company.status = CompanyStatus.SUSPENDED
    user, membership = make_user_and_membership(company_id=company_id)
    user.id = user_id
    session = FakePrincipalSession([(user, company, membership.role)])

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_principal(make_token(user_id, company_id), session))
    assert exc.value.status_code == 403
    assert "suspended" in exc.value.detail


def test_principal_allows_owner_into_suspended_workspace() -> None:
    company_id = uuid4()
    user_id = uuid4()
    company = Company(name="Ace Plumbing", slug="ace-plumbing")
    company.id = company_id
    company.status = CompanyStatus.SUSPENDED
    user, membership = make_user_and_membership(company_id=company_id, role=UserRole.OWNER)
    user.id = user_id
    session = FakePrincipalSession([(user, company, membership.role)])

    principal = asyncio.run(get_principal(make_token(user_id, company_id), session))

    assert principal.role == UserRole.OWNER
    assert principal.company_id == company_id


def test_principal_allows_member_in_active_workspace() -> None:
    company_id = uuid4()
    user_id = uuid4()
    company = Company(name="Ace Plumbing", slug="ace-plumbing")
    company.id = company_id
    user, membership = make_user_and_membership(company_id=company_id)
    user.id = user_id
    session = FakePrincipalSession([(user, company, membership.role)])

    principal = asyncio.run(get_principal(make_token(user_id, company_id), session))

    assert principal.user_id == user_id
    assert principal.company_id == company_id
    assert principal.role == UserRole.TECHNICIAN


def test_principal_rejects_cross_tenant_token() -> None:
    """A token minted for another company must never resolve to a principal."""
    session = FakePrincipalSession([])  # join on token company yields no membership row

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_principal(make_token(uuid4(), uuid4()), session))
    assert exc.value.status_code == 401


class FakeAuthSession:
    def __init__(self, company: Company | None) -> None:
        self.objects: list[object] = []
        self.company = company
        self.user: User | None = None
        self.committed = False

    def add(self, value: object) -> None:
        self.objects.append(value)

    async def execute(self, _statement: object) -> FakeResult:
        return FakeResult([self.user] if self.user else [])

    async def scalar(self, _statement: object) -> object:
        return self.company

    async def flush(self) -> None:  # noqa: D102
        return None

    async def commit(self) -> None:  # noqa: D102
        self.committed = True


def login_payload() -> LoginRequest:
    return LoginRequest(email="member@example.com", password=PASSWORD)


def test_login_denied_when_workspace_suspended_for_member() -> None:
    company_id = uuid4()
    user, membership = make_user_and_membership(company_id=company_id, role=UserRole.OFFICE_STAFF)
    company = Company(name="Ace Plumbing", slug="ace-plumbing")
    company.status = CompanyStatus.SUSPENDED
    session = FakeAuthSession(company)
    session.user = user

    with pytest.raises(HTTPException) as exc:
        asyncio.run(authenticate(session, login_payload()))
    assert exc.value.status_code == 403
    assert "suspended" in exc.value.detail
    assert not session.committed


def test_login_allows_owner_into_suspended_workspace() -> None:
    company_id = uuid4()
    user, _ = make_user_and_membership(company_id=company_id, role=UserRole.OWNER)
    company = Company(name="Ace Plumbing", slug="ace-plumbing")
    company.status = CompanyStatus.SUSPENDED
    session = FakeAuthSession(company)
    session.user = user

    tokens = asyncio.run(authenticate(session, login_payload()))

    assert tokens.access_token
    assert tokens.refresh_token
    assert any(isinstance(item, RefreshSession) for item in session.objects)
    assert session.committed


def test_login_rejects_user_without_membership() -> None:
    user = User(
        email="member@example.com",
        full_name="Morgan Member",
        password_hash=hash_password(PASSWORD),
        is_active=True,
    )
    user.memberships = []
    session = FakeAuthSession(Company(name="Ace Plumbing", slug="ace-plumbing"))
    session.user = user

    with pytest.raises(HTTPException) as exc:
        asyncio.run(authenticate(session, login_payload()))
    assert exc.value.status_code == 403
