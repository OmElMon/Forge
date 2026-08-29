import asyncio
from datetime import timedelta
from uuid import uuid4

import pyotp
import pytest
from fastapi import HTTPException

from app.core.security import (
    create_token,
    hash_password,
    hash_reset_pin,
    verify_reset_pin,
)
from app.models.audit import AuditLog
from app.models.company import Company
from app.models.enums import CompanyStatus, UserRole
from app.models.membership import Membership
from app.models.mfa_setting import MfaSetting
from app.models.session import RefreshSession
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    MfaChallenge,
    MfaChallengeVerifyRequest,
    MfaEnrollResult,
)
from app.schemas.principal import Principal
from app.services.auth import authenticate
from app.services.mfa import (
    confirm_mfa_enrollment,
    disable_mfa,
    enroll_mfa,
    verify_mfa_challenge,
)

PASSWORD = "a-very-strong-password"


class FakeResultRows:
    def __init__(self, rows: list[object] | None = None) -> None:
        self.rows = rows or []

    def scalar_one_or_none(self) -> object:
        return self.rows[0] if self.rows else None


def make_user(*, role: UserRole = UserRole.OWNER) -> tuple[User, Membership, Company]:
    company = Company(name="Ace Plumbing", slug="ace-plumbing")
    company.status = CompanyStatus.ACTIVE
    company.id = uuid4()
    user = User(
        email="owner@example.com",
        full_name="Owner",
        password_hash=hash_password(PASSWORD),
        is_active=True,
    )
    user.id = uuid4()
    membership = Membership(company_id=company.id, user_id=user.id, role=role)
    user.memberships = [membership]
    return user, membership, company


def make_setting(confirmed: bool) -> MfaSetting:
    return MfaSetting(
        user_id=uuid4(),
        secret=pyotp.random_base32(),
        recovery_hashes=[],
        confirmed=confirmed,
    )


def make_principal(user: User, membership: Membership) -> Principal:
    return Principal(
        user_id=user.id,
        company_id=membership.company_id,
        email=user.email,
        full_name=user.full_name,
        company_name="Ace Plumbing",
        role=membership.role,
    )


def login_payload() -> LoginRequest:
    return LoginRequest(email="owner@example.com", password=PASSWORD)


class FakeAuthSession:
    """Statement-aware session for authenticate()."""

    def __init__(
        self,
        user: User,
        company: Company,
        setting: MfaSetting | None,
    ) -> None:
        self.user = user
        self.company = company
        self.setting = setting
        self.objects: list[object] = []
        self.committed = False

    async def execute(self, _statement: object) -> FakeResultRows:
        return FakeResultRows([self.user] if self.user else [])

    async def scalar(self, statement: object) -> object:
        if "mfa_settings" in str(statement):
            return self.setting
        return self.company

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.committed = True

    def add(self, value: object) -> None:
        self.objects.append(value)


class FakeVerifySession:
    """Statement-aware session for verify_mfa_challenge()."""

    def __init__(
        self,
        user: User,
        setting: MfaSetting,
        membership: Membership,
        company: Company,
    ) -> None:
        self.user = user
        self.setting = setting
        self.membership = membership
        self.company = company
        self.objects: list[object] = []
        self.committed = False

    async def scalar(self, statement: object) -> object:
        text = str(statement)
        if "mfa_settings" in text:
            return self.setting
        if "memberships" in text:
            return self.membership
        if "companies" in text:
            return self.company
        if "users" in text:
            return self.user
        return None

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.committed = True

    def add(self, value: object) -> None:
        self.objects.append(value)


def make_mfa_token(subject: object, company_id: object) -> str:
    token, _, _ = create_token(
        subject=subject,
        company_id=company_id,
        token_type="mfa",
        expires_delta=timedelta(minutes=5),
    )
    return token


class TestLoginChallenge:
    def test_login_returns_challenge_when_mfa_confirmed(self) -> None:
        user, membership, company = make_user()
        setting = make_setting(confirmed=True)
        setting.user_id = user.id
        session = FakeAuthSession(user, company, setting)

        result = asyncio.run(authenticate(session, login_payload()))

        assert isinstance(result, MfaChallenge)
        assert result.mfa_session
        assert not session.committed
        assert not any(isinstance(item, RefreshSession) for item in session.objects)

    def test_login_skips_challenge_when_unconfirmed(self) -> None:
        user, _, company = make_user()
        session = FakeAuthSession(user, company, make_setting(confirmed=False))

        result = asyncio.run(authenticate(session, login_payload()))

        assert not isinstance(result, MfaChallenge)
        assert result.access_token

    def test_login_skips_challenge_when_not_enrolled(self) -> None:
        user, _, company = make_user()
        session = FakeAuthSession(user, company, None)

        result = asyncio.run(authenticate(session, login_payload()))

        assert not isinstance(result, MfaChallenge)
        assert result.access_token


class TestVerifyMfa:
    def _session(self) -> tuple[User, Membership, Company, MfaSetting, FakeVerifySession]:
        user, membership, company = make_user()
        setting = make_setting(confirmed=True)
        setting.user_id = user.id
        session = FakeVerifySession(user, setting, membership, company)
        return user, membership, company, setting, session

    def test_accepts_valid_totp_code(self) -> None:
        user, membership, _, setting, session = self._session()
        request = MfaChallengeVerifyRequest(
            mfa_session=make_mfa_token(user.id, membership.company_id),
            code=pyotp.TOTP(setting.secret).now(),
        )

        tokens = asyncio.run(verify_mfa_challenge(session, request))

        assert tokens.access_token
        assert tokens.refresh_token
        assert session.committed
        assert any(isinstance(item, AuditLog) for item in session.objects)

    def test_accepts_recovery_code_and_consumes_it(self) -> None:
        user, membership, _, setting, session = self._session()
        recovery_code = "recovery-token-123"
        setting.recovery_hashes = [hash_reset_pin("first-code"), hash_reset_pin(recovery_code)]
        request = MfaChallengeVerifyRequest(
            mfa_session=make_mfa_token(user.id, membership.company_id), code=recovery_code
        )

        tokens = asyncio.run(verify_mfa_challenge(session, request))

        assert tokens.access_token
        assert not any(verify_reset_pin(recovery_code, h) for h in setting.recovery_hashes)
        assert any(verify_reset_pin("first-code", h) for h in setting.recovery_hashes)

    def test_rejects_invalid_code(self) -> None:
        user, membership, _, setting, session = self._session()
        request = MfaChallengeVerifyRequest(
            mfa_session=make_mfa_token(user.id, membership.company_id), code="000000"
        )

        with pytest.raises(HTTPException) as exc:
            asyncio.run(verify_mfa_challenge(session, request))
        assert exc.value.status_code == 401

    def test_rejects_access_token_as_challenge(self) -> None:
        user, membership, _, setting, session = self._session()
        access, _, _ = create_token(
            subject=user.id,
            company_id=membership.company_id,
            token_type="access",
            expires_delta=timedelta(minutes=5),
        )
        request = MfaChallengeVerifyRequest(
            mfa_session=access, code=pyotp.TOTP(setting.secret).now()
        )

        with pytest.raises(HTTPException) as exc:
            asyncio.run(verify_mfa_challenge(session, request))
        assert exc.value.status_code == 401

    def test_blocks_suspended_workspace_for_non_owner(self) -> None:
        user, membership, company = make_user(role=UserRole.ADMIN)
        company.status = CompanyStatus.SUSPENDED
        setting = make_setting(confirmed=True)
        setting.user_id = user.id
        session = FakeVerifySession(user, setting, membership, company)
        request = MfaChallengeVerifyRequest(
            mfa_session=make_mfa_token(user.id, membership.company_id),
            code=pyotp.TOTP(setting.secret).now(),
        )

        with pytest.raises(HTTPException) as exc:
            asyncio.run(verify_mfa_challenge(session, request))
        assert exc.value.status_code == 403


class FakeEnrollSession:
    def __init__(self, existing: MfaSetting | None) -> None:
        self.existing = existing
        self.objects: list[object] = []
        self.deleted: list[object] = []
        self.committed = False

    async def scalar(self, _statement: object) -> object:
        return self.existing

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.committed = True

    async def delete(self, value: object) -> None:
        self.deleted.append(value)

    def add(self, value: object) -> None:
        self.objects.append(value)


def seeded_setting(confirmed: bool) -> MfaSetting:
    setting = make_setting(confirmed=confirmed)
    setting.recovery_hashes = [
        hash_reset_pin(code) for code in ["first-recovery-code", "second-recovery-code"]
    ]
    return setting


class TestEnrollment:
    def test_enroll_returns_secret_uri_and_hashed_recovery_codes(self) -> None:
        user, membership, _ = make_user()
        session = FakeEnrollSession(None)

        result = asyncio.run(enroll_mfa(session, make_principal(user, membership)))

        assert isinstance(result, MfaEnrollResult)
        assert len(result.secret) == 32
        assert result.provisioning_uri.startswith("otpauth://totp/CrewPilot")
        assert len(result.recovery_codes) == 8
        stored = next(o for o in session.objects if isinstance(o, MfaSetting))
        assert stored.confirmed is False
        assert stored.recovery_hashes != result.recovery_codes
        assert all(
            verify_reset_pin(code, encoded)
            for code, encoded in zip(result.recovery_codes, stored.recovery_hashes, strict=True)
        )
        assert session.committed

    def test_enroll_replaces_existing_setting(self) -> None:
        user, membership, _ = make_user()
        existing = make_setting(confirmed=False)
        session = FakeEnrollSession(existing)

        asyncio.run(enroll_mfa(session, make_principal(user, membership)))

        assert existing in session.deleted
        assert len([o for o in session.objects if isinstance(o, MfaSetting)]) == 1

    def test_confirm_activates_enrollment(self) -> None:
        user, membership, _ = make_user()
        setting = seeded_setting(False)
        session = FakeEnrollSession(setting)

        asyncio.run(
            confirm_mfa_enrollment(
                session, make_principal(user, membership), pyotp.TOTP(setting.secret).now()
            )
        )

        assert setting.confirmed is True
        assert session.committed

    def test_confirm_rejects_invalid_code(self) -> None:
        user, membership, _ = make_user()
        setting = seeded_setting(False)
        session = FakeEnrollSession(setting)

        with pytest.raises(HTTPException) as exc:
            asyncio.run(confirm_mfa_enrollment(session, make_principal(user, membership), "000000"))
        assert exc.value.status_code == 400
        assert setting.confirmed is False

    def test_confirm_requires_pending_enrollment(self) -> None:
        user, membership, _ = make_user()
        session = FakeEnrollSession(None)

        with pytest.raises(HTTPException) as exc:
            asyncio.run(confirm_mfa_enrollment(session, make_principal(user, membership), "000000"))
        assert exc.value.status_code == 400

    def test_disable_removes_setting_with_valid_totp(self) -> None:
        user, membership, _ = make_user()
        setting = seeded_setting(True)
        session = FakeEnrollSession(setting)

        asyncio.run(
            disable_mfa(session, make_principal(user, membership), pyotp.TOTP(setting.secret).now())
        )

        assert setting in session.deleted
        assert session.committed

    def test_disable_accepts_recovery_code(self) -> None:
        user, membership, _ = make_user()
        setting = seeded_setting(True)
        session = FakeEnrollSession(setting)

        asyncio.run(disable_mfa(session, make_principal(user, membership), "second-recovery-code"))

        assert setting in session.deleted
        assert session.committed

    def test_disable_rejects_invalid_code(self) -> None:
        user, membership, _ = make_user()
        setting = seeded_setting(True)
        session = FakeEnrollSession(setting)

        with pytest.raises(HTTPException) as exc:
            asyncio.run(disable_mfa(session, make_principal(user, membership), "000000"))
        assert exc.value.status_code == 400
        assert setting not in session.deleted
