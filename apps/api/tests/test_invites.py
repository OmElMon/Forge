import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.core.security import fingerprint_token, hash_password
from app.integrations.messaging import RecordingMessagingProvider
from app.models.audit import AuditLog
from app.models.company import Company
from app.models.enums import UserRole
from app.models.invite import Invite
from app.models.membership import Membership
from app.models.session import RefreshSession
from app.models.user import User
from app.schemas.invite import InviteAcceptRequest, InviteCreate
from app.schemas.principal import Principal
from app.services import invites as invites_service
from app.services.auth import issue_tokens
from app.services.integrations import MessageChannel
from app.services.invites import (
    accept_company_invite,
    cancel_company_invite,
    create_company_invite,
    list_company_invites,
    list_company_members,
    preview_invite,
    resend_company_invite,
)

TOKEN = "invite-token-value-abcdef-1234567890"


class FakeResult:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def scalar_one_or_none(self) -> object:
        return self.rows[0] if self.rows else None

    def scalar(self) -> object:
        return self.rows[0] if self.rows else None

    def one_or_none(self) -> object:
        return self.rows[0] if self.rows else None

    def all(self) -> list[object]:
        return self.rows


class FakeSession:
    def __init__(self) -> None:
        self.objects: list[object] = []
        self.runs: list[str] = []
        self.company = Company(name="Ace Plumbing", slug="ace-plumbing")
        self.cancel_row: object | None = None
        self.list_rows: list[object] = []
        self.invitee: User | None = None
        self.invitee_membership: UUID | None = None
        self.accept_invite: Invite | None = None
        self.created_invite: Invite | None = None
        self.committed = False

    def add(self, value: object) -> None:
        self.objects.append(value)
        if isinstance(value, Invite):
            value.id = value.id or uuid4()
            value.created_at = value.created_at or datetime.now(UTC)
            self.created_invite = value

    async def get(self, _model: type[object], _ident: object) -> object:
        return self.company

    async def flush(self) -> None:  # noqa: D102
        return None

    async def commit(self) -> None:  # noqa: D102
        self.committed = True

    async def refresh(self, _instance: object) -> None:  # noqa: D102
        return None

    async def execute(self, statement: object) -> FakeResult:
        self.runs.append(str(statement))
        if "invites.id =" in str(statement):
            return FakeResult([self.cancel_row] if self.cancel_row else [])
        return FakeResult(list(self.list_rows))

    async def scalar(self, statement: object) -> object:
        self.runs.append(str(statement))
        text = str(statement).lower()
        if "memberships" in text:
            return self.invitee_membership
        if "users" in text and "email" in text:
            return self.invitee
        if "invites" in text:
            return self.accept_invite if self.accept_invite else self.created_invite
        return None


def make_principal(*, role: UserRole = UserRole.OWNER) -> Principal:
    return Principal(
        user_id=uuid4(),
        company_id=uuid4(),
        email="owner@example.com",
        full_name="Omar Owner",
        company_name="Ace Plumbing",
        role=role,
    )


def make_invite(*, company_id: UUID, email: str = "new@example.com") -> Invite:
    return Invite(
        id=uuid4(),
        company_id=company_id,
        user_id=uuid4(),
        email=email,
        full_name="Alina New",
        role=UserRole.OFFICE_STAFF,
        token_fingerprint=fingerprint_token(TOKEN),
        expires_at=datetime.now(UTC) + timedelta(days=7),
        created_at=datetime.now(UTC),
    )


def test_create_invite_emails_token_and_audits(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(invites_service, "get_messaging_provider", lambda: provider)

    principal = make_principal()
    session = FakeSession()

    read = asyncio.run(
        create_company_invite(
            session,
            principal,
            InviteCreate(
                email="new@example.com",
                full_name="  Alina New  ",
                role=UserRole.OFFICE_STAFF,
            ),
        )
    )

    assert read.status == "pending"
    assert read.full_name == "Alina New"
    assert read.invited_by == principal.full_name

    assert len(provider.sent) == 1
    message = provider.sent[0]
    assert message.to == "new@example.com"
    assert message.channel == MessageChannel.EMAIL
    assert message.company_id == principal.company_id
    assert "accept-invite" in message.body
    assert message.body.startswith("Alina New")

    invites = [item for item in session.objects if isinstance(item, Invite)]
    assert len(invites) == 1
    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert any(item.action == "invite.created" for item in audits)
    assert session.committed


def test_create_invite_rejects_non_manager() -> None:
    session = FakeSession()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_company_invite(
                session,
                make_principal(role=UserRole.TECHNICIAN),
                InviteCreate(
                    email="new@example.com",
                    full_name="Alina New",
                    role=UserRole.OFFICE_STAFF,
                ),
            )
        )
    assert exc.value.status_code == 403


def test_create_invite_admin_cannot_invite_owners(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(invites_service, "get_messaging_provider", lambda: provider)

    session = FakeSession()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_company_invite(
                session,
                make_principal(role=UserRole.ADMIN),
                InviteCreate(email="new@example.com", full_name="Alina New", role=UserRole.OWNER),
            )
        )
    assert exc.value.status_code == 403
    assert "owner" in exc.value.detail


def test_create_invite_rejects_existing_member(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(invites_service, "get_messaging_provider", lambda: provider)

    principal = make_principal()
    session = FakeSession()
    session.invitee = User(
        email="member@example.com",
        full_name="Morgan Member",
        password_hash=hash_password("a-very-strong-password"),
        is_active=True,
    )
    session.invitee_membership = uuid4()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_company_invite(
                session,
                principal,
                InviteCreate(
                    email="member@example.com",
                    full_name="Morgan Member",
                    role=UserRole.OFFICE_STAFF,
                ),
            )
        )
    assert exc.value.status_code == 409


def test_list_invites_marks_statuses() -> None:
    principal = make_principal()
    session = FakeSession()
    pending = make_invite(company_id=principal.company_id)
    accepted = make_invite(company_id=principal.company_id, email="accepted@example.com")
    accepted.accepted_at = datetime.now(UTC)
    expired = make_invite(company_id=principal.company_id, email="expired@example.com")
    expired.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    canceled = make_invite(company_id=principal.company_id, email="canceled@example.com")
    canceled.canceled_at = datetime.now(UTC)
    session.list_rows = [
        (pending, "Omar Owner"),
        (accepted, "Omar Owner"),
        (expired, "Omar Owner"),
        (canceled, "Omar Owner"),
    ]

    reads = asyncio.run(list_company_invites(session, principal))

    assert [read.status for read in reads] == ["pending", "accepted", "expired", "canceled"]


def test_list_members_joins_user_profile() -> None:
    principal = make_principal()
    session = FakeSession()
    joined_at = datetime.now(UTC)
    session.list_rows = [
        (
            Membership(
                id=uuid4(),
                company_id=principal.company_id,
                user_id=uuid4(),
                role=UserRole.DISPATCHER,
                created_at=joined_at,
            ),
            "maya@example.com",
            "Maya Dispatcher",
        )
    ]

    members = asyncio.run(list_company_members(session, principal))

    assert len(members) == 1
    assert members[0].email == "maya@example.com"
    assert members[0].full_name == "Maya Dispatcher"
    assert members[0].role == UserRole.DISPATCHER
    assert members[0].joined_at == joined_at


def test_cancel_invite_marks_canceled_and_audits() -> None:
    principal = make_principal()
    session = FakeSession()
    invite = make_invite(company_id=principal.company_id)
    session.cancel_row = (invite, "Omar Owner")

    read = asyncio.run(cancel_company_invite(session, principal, invite.id))

    assert read.status == "canceled"
    assert invite.canceled_at is not None
    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert any(item.action == "invite.canceled" for item in audits)
    assert session.committed


def test_cancel_accept_invite_raises_conflict() -> None:
    principal = make_principal()
    session = FakeSession()
    invite = make_invite(company_id=principal.company_id)
    invite.accepted_at = datetime.now(UTC)
    session.cancel_row = (invite, "Omar Owner")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(cancel_company_invite(session, principal, invite.id))
    assert exc.value.status_code == 409


def test_resend_invite_rotates_token_and_emails(monkeypatch) -> None:
    provider = RecordingMessagingProvider()
    monkeypatch.setattr(invites_service, "get_messaging_provider", lambda: provider)

    principal = make_principal()
    session = FakeSession()
    session.company.id = principal.company_id
    invite = make_invite(company_id=principal.company_id)
    original_fingerprint = invite.token_fingerprint
    session.cancel_row = (invite, "Omar Owner")

    read = asyncio.run(resend_company_invite(session, principal, invite.id))

    assert read.status == "pending"
    assert invite.token_fingerprint != original_fingerprint
    assert invite.expires_at > datetime.now(UTC) + timedelta(days=6)
    assert len(provider.sent) == 1
    assert "accept-invite" in provider.sent[0].body
    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert any(item.action == "invite.resend" for item in audits)
    assert session.committed


def test_preview_invite_returns_company_info() -> None:
    principal = make_principal()
    company_id = principal.company_id
    session = FakeSession()
    session.company.id = company_id
    session.accept_invite = make_invite(company_id=company_id, email="preview.target@example.com")

    preview = asyncio.run(preview_invite(session, TOKEN))

    assert preview.email == "preview.target@example.com"
    assert preview.company_name == session.company.name
    assert preview.role == UserRole.OFFICE_STAFF


def test_preview_invite_rejects_used_token() -> None:
    principal = make_principal()
    session = FakeSession()
    invite = make_invite(company_id=principal.company_id)
    invite.accepted_at = datetime.now(UTC)
    session.accept_invite = invite

    with pytest.raises(HTTPException) as exc:
        asyncio.run(preview_invite(session, TOKEN))
    assert exc.value.status_code == 400


def test_accept_invite_creates_user_and_membership() -> None:
    principal = make_principal()
    company_id = principal.company_id
    session = FakeSession()
    session.company.id = company_id
    session.accept_invite = make_invite(company_id=company_id)
    session.invitee = None

    tokens = asyncio.run(
        accept_company_invite(
            session, InviteAcceptRequest(token=TOKEN, password="a-brand-new-password")
        )
    )

    assert tokens.access_token
    assert tokens.refresh_token
    created_users = [item for item in session.objects if isinstance(item, User)]
    assert len(created_users) == 1
    created_memberships = [item for item in session.objects if isinstance(item, Membership)]
    assert len(created_memberships) == 1
    assert created_memberships[0].role == UserRole.OFFICE_STAFF
    assert created_memberships[0].company_id == company_id
    assert session.accept_invite.accepted_at is not None
    assert any(isinstance(item, RefreshSession) for item in session.objects)
    assert any(
        item.action == "invite.accepted" for item in session.objects if isinstance(item, AuditLog)
    )
    assert session.committed


def test_accept_invite_adds_existing_active_user_to_company() -> None:
    principal = make_principal()
    company_id = principal.company_id
    session = FakeSession()
    session.company.id = company_id
    session.accept_invite = make_invite(company_id=company_id)
    session.invitee = User(
        email="new@example.com",
        full_name="Alina New",
        password_hash=hash_password("an-existing-password"),
        is_active=True,
    )

    tokens = asyncio.run(
        accept_company_invite(
            session, InviteAcceptRequest(token=TOKEN, password="a-brand-new-password")
        )
    )

    assert tokens.access_token
    created_users = [item for item in session.objects if isinstance(item, User)]
    assert created_users == []
    created_memberships = [item for item in session.objects if isinstance(item, Membership)]
    assert len(created_memberships) == 1
    assert created_memberships[0].user_id == session.invitee.id


def test_accept_invite_rejects_existing_member() -> None:
    principal = make_principal()
    session = FakeSession()
    session.company.id = principal.company_id
    session.accept_invite = make_invite(company_id=principal.company_id)
    session.invitee = User(
        email="new@example.com",
        full_name="Alina New",
        password_hash=hash_password("an-existing-password"),
        is_active=True,
    )
    session.invitee_membership = uuid4()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            accept_company_invite(
                session, InviteAcceptRequest(token=TOKEN, password="a-brand-new-password")
            )
        )
    assert exc.value.status_code == 409


def test_accept_invite_rejects_unknown_token() -> None:
    session = FakeSession()
    session.accept_invite = None

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            accept_company_invite(
                session, InviteAcceptRequest(token=TOKEN, password="a-brand-new-password")
            )
        )
    assert exc.value.status_code == 400


def test_accept_invite_rejects_expired_token() -> None:
    principal = make_principal()
    session = FakeSession()
    session.accept_invite = make_invite(company_id=principal.company_id)
    session.accept_invite.expires_at = datetime.now(UTC) - timedelta(minutes=1)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            accept_company_invite(
                session, InviteAcceptRequest(token=TOKEN, password="a-brand-new-password")
            )
        )
    assert exc.value.status_code == 400


def test_issue_tokens_renamed_public_import() -> None:
    from app.services.auth import issue_tokens as public_name

    assert public_name is issue_tokens
