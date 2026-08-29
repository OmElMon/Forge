import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.security import (
    create_email_verification_token,
    fingerprint_token,
    hash_password,
)
from app.integrations.messaging import RecordingMessagingProvider
from app.models.audit import AuditLog
from app.models.company import Company
from app.models.email_verification import EmailVerification
from app.models.enums import UserRole
from app.models.membership import Membership
from app.models.user import User
from app.schemas.auth import (
    EmailVerifyConfirmRequest,
    EmailVerifyRequest,
    LoginRequest,
    ResetCodeDelivery,
)
from app.services import email_verification as email_verification_service
from app.services.auth import authenticate
from app.services.email_verification import (
    confirm_email_verification,
    request_email_verification,
)
from app.services.integrations import MessageChannel

PASSWORD = "a-very-strong-password"


class FakeResult:
    def __init__(self, value: object = None) -> None:
        self._value = value

    def scalar_one_or_none(self) -> object:
        return self._value

    def scalar(self) -> object:
        return self._value


class FakeSession:
    def __init__(self, *, user: User | None = None, company_id: UUID | None = None) -> None:
        self.objects: list[object] = []
        self.runs: list[object] = []
        self.user = user
        self.company_id = company_id
        self.email_verification: EmailVerification | None = None
        self.committed = False

    def add(self, value: object) -> None:
        self.objects.append(value)

    async def get(self, _model: type[object], _ident: object) -> object:
        return self.user

    async def flush(self) -> None:  # noqa: D102
        return None

    async def commit(self) -> None:  # noqa: D102
        self.committed = True

    async def refresh(self, _instance: object) -> None:  # noqa: D102
        return None

    async def execute(self, statement: object) -> FakeResult:
        self.runs.append(statement)
        return FakeResult(self.user)

    async def scalar(self, statement: object) -> object:
        self.runs.append(statement)
        text = str(statement)
        if "email_verifications" in text:
            return self.email_verification
        if "memberships" in text:
            return self.company_id
        return self.user


def make_user(company_id: UUID, *, verified: bool = False) -> User:
    user = User(
        email="owner@example.com",
        full_name="Omar Owner",
        password_hash=hash_password(PASSWORD),
        is_active=True,
    )
    user.email_verified = verified
    user.memberships = [Membership(company_id=company_id, user_id=user.id, role=UserRole.OWNER)]
    return user


def make_verification(
    user_id: UUID, *, fingerprint: str, expires_at: datetime
) -> EmailVerification:
    return EmailVerification(
        user_id=user_id,
        token_fingerprint=fingerprint,
        expires_at=expires_at,
        consumed_at=None,
    )


def request_verify(session: FakeSession, *, email: str) -> ResetCodeDelivery:
    return asyncio.run(request_email_verification(session, EmailVerifyRequest(email=email)))


def test_email_verification_token_is_high_entropy_and_hashed() -> None:
    token, fingerprint = create_email_verification_token()

    assert len(token) >= 40
    assert fingerprint == hashlib.sha256(token.encode()).hexdigest()


def test_request_creates_token_and_emails_user(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(email_verification_service, "get_messaging_provider", lambda: provider)

    company_id = uuid4()
    session = FakeSession(user=make_user(company_id), company_id=company_id)

    delivery = request_verify(session, email=session.user.email)

    assert delivery.status == "sent"
    assert delivery.channel == "email"
    assert delivery.code_valid_seconds == settings.email_verification_expire_minutes * 60
    assert delivery.dev_code is not None

    assert len(provider.sent) == 1
    message = provider.sent[0]
    assert message.to == session.user.email
    assert message.channel == MessageChannel.EMAIL
    assert message.company_id == company_id
    assert delivery.dev_code in message.body
    assert "verify-email" in message.body

    saved = [item for item in session.objects if isinstance(item, EmailVerification)]
    assert len(saved) == 1
    assert saved[0].token_fingerprint == fingerprint_token(delivery.dev_code)
    assert saved[0].expires_at > datetime.now(UTC)


def test_request_does_not_reveal_unknown_account(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(email_verification_service, "get_messaging_provider", lambda: provider)

    session = FakeSession()
    delivery = request_verify(session, email="nobody@example.com")

    assert delivery.status == "sent"
    assert delivery.dev_code is None
    assert len(provider.sent) == 0
    assert session.committed is False


def test_request_expires_outstanding_tokens() -> None:
    from sqlalchemy.sql.dml import UpdateBase

    company_id = uuid4()
    session = FakeSession(user=make_user(company_id), company_id=company_id)

    request_verify(session, email=session.user.email)

    updates = [statement for statement in session.runs if isinstance(statement, UpdateBase)]
    assert len(updates) >= 1
    assert "email_verifications" in str(updates[0])
    assert session.committed is True


def test_confirm_marks_user_verified_and_audits() -> None:
    user = make_user(company_id := uuid4())
    token, fingerprint = create_email_verification_token()
    session = FakeSession(user=user, company_id=company_id)
    session.email_verification = make_verification(
        user.id, fingerprint=fingerprint, expires_at=datetime.now(UTC) + timedelta(hours=1)
    )

    asyncio.run(confirm_email_verification(session, EmailVerifyConfirmRequest(token=token)))

    assert user.email_verified is True
    assert user.email_verified_at is not None
    assert session.email_verification.consumed_at is not None
    assert session.committed is True
    audit = [item for item in session.objects if isinstance(item, AuditLog)]
    assert len(audit) == 1
    assert audit[0].action == "auth.email_verified"
    assert audit[0].actor_user_id == user.id
    assert audit[0].company_id == company_id


def test_confirm_rejects_consumed_or_expired_token() -> None:
    user = make_user(company_id := uuid4())
    token, fingerprint = create_email_verification_token()
    session = FakeSession(user=user, company_id=company_id)
    session.email_verification = make_verification(
        user.id, fingerprint=fingerprint, expires_at=datetime.now(UTC) - timedelta(minutes=1)
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(confirm_email_verification(session, EmailVerifyConfirmRequest(token=token)))
    assert exc.value.status_code == 400
    assert session.committed is False


def test_confirm_rejects_inactive_account() -> None:
    user = make_user(company_id := uuid4())
    user.is_active = False
    token, fingerprint = create_email_verification_token()
    session = FakeSession(user=user, company_id=company_id)
    session.email_verification = make_verification(
        user.id, fingerprint=fingerprint, expires_at=datetime.now(UTC) + timedelta(hours=1)
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(confirm_email_verification(session, EmailVerifyConfirmRequest(token=token)))
    assert exc.value.status_code == 403
    assert session.committed is False


class FakeAuthSession:
    def __init__(self, user: User, company: Company) -> None:
        self.objects: list[object] = []
        self.user = user
        self.company = company
        self.committed = False

    def add(self, value: object) -> None:
        self.objects.append(value)

    async def execute(self, _statement: object) -> FakeResult:
        return FakeResult(self.user)

    async def scalar(self, _statement: object) -> object:
        return self.company

    async def flush(self) -> None:  # noqa: D102
        return None

    async def commit(self) -> None:  # noqa: D102
        self.committed = True


def login_payload() -> LoginRequest:
    return LoginRequest(email="owner@example.com", password=PASSWORD)


def make_auth_session(*, verified: bool) -> FakeAuthSession:
    company_id = uuid4()
    user = make_user(company_id, verified=verified)
    company = Company(name="Ace Plumbing", slug="ace-plumbing")
    session = FakeAuthSession(user, company)
    return session


def test_login_blocks_unverified_email_when_required(monkeypatch) -> None:
    monkeypatch.setattr(settings, "email_verification_required", True)
    session = make_auth_session(verified=False)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(authenticate(session, login_payload()))
    assert exc.value.status_code == 403
    assert exc.value.detail == "Email not verified."
    assert not session.committed


def test_login_allows_verified_email_when_required(monkeypatch) -> None:
    monkeypatch.setattr(settings, "email_verification_required", True)
    session = make_auth_session(verified=True)

    tokens = asyncio.run(authenticate(session, login_payload()))
    assert tokens.access_token
    assert session.committed is True


def test_login_ignores_verification_when_not_required(monkeypatch) -> None:
    monkeypatch.setattr(settings, "email_verification_required", False)
    session = make_auth_session(verified=False)

    tokens = asyncio.run(authenticate(session, login_payload()))
    assert tokens.access_token
