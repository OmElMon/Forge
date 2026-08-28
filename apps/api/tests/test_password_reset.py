import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.sql.dml import UpdateBase

from app.core.config import settings
from app.core.security import (
    create_password_reset_token,
    fingerprint_token,
    hash_password,
    verify_password,
)
from app.integrations.messaging import RecordingMessagingProvider
from app.models.audit import AuditLog
from app.models.enums import UserRole
from app.models.membership import Membership
from app.models.password_reset import PasswordReset
from app.models.user import User
from app.schemas.auth import PasswordResetConfirmRequest, PasswordResetRequest, ResetCodeDelivery
from app.services import password_reset as password_reset_service
from app.services.integrations import MessageChannel
from app.services.password_reset import confirm_password_reset, request_password_reset


class FakeResult:
    def __init__(self, value: object = None) -> None:
        self._value = value

    def scalar_one_or_none(self) -> object:
        return self._value

    def scalar(self) -> object:
        return self._value


class FakeSession:
    def __init__(self) -> None:
        self.objects: list[object] = []
        self.runs: list[object] = []
        self.user: User | None = None
        self.password_reset: PasswordReset | None = None
        self.company_id: UUID | None = None
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
        if isinstance(statement, UpdateBase):
            return FakeResult(None)
        return FakeResult(self.user)

    async def scalar(self, statement: object) -> object:
        self.runs.append(statement)
        if isinstance(statement, UpdateBase):
            return None
        if "password_resets" in str(statement):
            return self.password_reset
        return self.company_id


def make_user(company_id: UUID) -> User:
    user = User(
        email="owner@example.com",
        full_name="Omar Owner",
        password_hash=hash_password("a-very-strong-password"),
        is_active=True,
    )
    user.memberships = [Membership(company_id=company_id, user_id=user.id, role=UserRole.OWNER)]
    return user


def make_reset(user_id: UUID, *, fingerprint: str, expires_at: datetime) -> PasswordReset:
    return PasswordReset(
        user_id=user_id,
        token_fingerprint=fingerprint,
        expires_at=expires_at,
        consumed_at=None,
    )


def request_reset(session: FakeSession, *, email: str) -> ResetCodeDelivery:
    payload = PasswordResetRequest(email=email)
    return asyncio.run(request_password_reset(session, payload))


def test_password_reset_token_is_high_entropy_and_hashed() -> None:
    token, fingerprint = create_password_reset_token()

    assert len(token) >= 40
    assert fingerprint == hashlib.sha256(token.encode()).hexdigest()


def test_request_password_reset_creates_token_and_emails_user(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(password_reset_service, "get_messaging_provider", lambda: provider)

    session = FakeSession()
    company_id = uuid4()
    user = make_user(company_id)
    session.user = user

    delivery = request_reset(session, email=user.email)

    assert delivery.status == "sent"
    assert delivery.channel == "email"
    assert delivery.code_valid_seconds == settings.password_reset_token_expire_minutes * 60
    assert delivery.dev_code is not None

    assert len(provider.sent) == 1
    message = provider.sent[0]
    assert message.to == user.email
    assert message.channel == MessageChannel.EMAIL
    assert message.company_id == company_id
    assert delivery.dev_code in message.body
    assert "reset-password" in message.body

    saved = [item for item in session.objects if isinstance(item, PasswordReset)]
    assert len(saved) == 1
    assert saved[0].token_fingerprint == fingerprint_token(delivery.dev_code)
    assert saved[0].expires_at > datetime.now(UTC)


def test_request_password_reset_expires_outstanding_tokens(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(password_reset_service, "get_messaging_provider", lambda: provider)

    session = FakeSession()
    user = make_user(uuid4())
    session.user = user

    request_reset(session, email=user.email)

    updates = [run for run in session.runs if isinstance(run, UpdateBase)]
    assert any("password_resets" in str(run) for run in updates)


def test_request_password_reset_does_not_leak_unknown_accounts(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(password_reset_service, "get_messaging_provider", lambda: provider)

    session = FakeSession()
    session.user = None

    delivery = request_reset(session, email="nobody@example.com")

    assert delivery.status == "sent"
    assert delivery.dev_code is None
    assert provider.sent == []
    assert session.objects == []


def test_confirm_password_reset_updates_password_and_consumes_token() -> None:
    session = FakeSession()
    company_id = uuid4()
    user = make_user(company_id)
    session.user = user
    session.company_id = company_id
    original_hash = user.password_hash
    fingerprint = fingerprint_token("reset-token-value-1234567890")
    session.password_reset = make_reset(
        user.id, fingerprint=fingerprint, expires_at=datetime.now(UTC) + timedelta(minutes=30)
    )

    asyncio.run(
        confirm_password_reset(
            session,
            PasswordResetConfirmRequest(
                token="reset-token-value-1234567890", password="new-password-1234"
            ),
        )
    )

    assert user.password_hash != original_hash
    assert verify_password("new-password-1234", user.password_hash)
    assert session.password_reset.consumed_at is not None
    assert session.committed

    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert any(
        item.action == "auth.password_reset" and item.company_id == company_id for item in audits
    )


def test_confirm_password_reset_rejects_unknown_token() -> None:
    session = FakeSession()
    session.password_reset = None

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            confirm_password_reset(
                session,
                PasswordResetConfirmRequest(
                    token="unknown-token-value-1234567890", password="new-password-1234"
                ),
            )
        )

    assert exc.value.status_code == 400


def test_confirm_password_reset_rejects_consumed_token() -> None:
    session = FakeSession()
    user = make_user(uuid4())
    session.user = user
    session.company_id = uuid4()
    session.password_reset = make_reset(
        user.id,
        fingerprint=fingerprint_token("reset-token-value-1234567890"),
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
    )
    session.password_reset.consumed_at = datetime.now(UTC)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            confirm_password_reset(
                session,
                PasswordResetConfirmRequest(
                    token="reset-token-value-1234567890", password="new-password-1234"
                ),
            )
        )

    assert exc.value.status_code == 400


def test_confirm_password_reset_rejects_expired_token() -> None:
    session = FakeSession()
    user = make_user(uuid4())
    session.user = user
    session.company_id = uuid4()
    session.password_reset = make_reset(
        user.id,
        fingerprint=fingerprint_token("reset-token-value-1234567890"),
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            confirm_password_reset(
                session,
                PasswordResetConfirmRequest(
                    token="reset-token-value-1234567890", password="new-password-1234"
                ),
            )
        )

    assert exc.value.status_code == 400
