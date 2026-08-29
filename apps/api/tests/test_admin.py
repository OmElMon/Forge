import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.audit import AuditLog
from app.models.company import Company
from app.models.enums import CompanyStatus, UserRole
from app.schemas.principal import Principal
from app.services.admin import get_admin_overview, set_company_status


class FakeSession:
    def __init__(self, company: Company | None = None) -> None:
        self.objects: list[object] = []
        self.company = company or Company(name="Ace Plumbing", slug="ace-plumbing")
        self.company.id = self.company.id or uuid4()
        self.counts = {"memberships": 3, "invites": 2, "audit_logs": 41}
        self.committed = False

    def add(self, value: object) -> None:
        self.objects.append(value)

    async def get(self, _model: type[object], ident: object) -> object:
        return self.company if ident == self.company.id else None

    async def flush(self) -> None:  # noqa: D102
        return None

    async def commit(self) -> None:  # noqa: D102
        self.committed = True

    async def scalar(self, statement: object) -> object:
        text = str(statement).lower()
        for table, count in self.counts.items():
            if table in text:
                return count
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


def test_admin_overview_is_owner_only() -> None:
    session = FakeSession()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_admin_overview(session, make_principal(role=UserRole.ADMIN)))
    assert exc.value.status_code == 403


def test_admin_overview_counts_tenant_records() -> None:
    principal = make_principal()
    company = FakeSession().company
    company.id = principal.company_id
    session = FakeSession(company=company)

    companies, members, invites, audits = asyncio.run(get_admin_overview(session, principal))

    assert companies is company
    assert members == 3
    assert invites == 2
    assert audits == 41


def test_set_company_status_requires_owner() -> None:
    session = FakeSession()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            set_company_status(
                session,
                make_principal(role=UserRole.ADMIN),
                CompanyStatus.SUSPENDED,
            )
        )
    assert exc.value.status_code == 403


def test_suspend_marks_workspace_and_audits(monkeypatch) -> None:
    principal = make_principal()
    company = FakeSession().company
    company.id = principal.company_id
    session = FakeSession(company=company)

    result = asyncio.run(set_company_status(session, principal, CompanyStatus.SUSPENDED))

    assert result.status == CompanyStatus.SUSPENDED
    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert any(item.action == "admin.company.suspended" for item in audits)
    assert session.committed


def test_reactivate_marks_workspace_and_audits(monkeypatch) -> None:
    principal = make_principal()
    company = FakeSession().company
    company.id = principal.company_id
    company.status = CompanyStatus.SUSPENDED
    session = FakeSession(company=company)

    result = asyncio.run(set_company_status(session, principal, CompanyStatus.ACTIVE))

    assert result.status == CompanyStatus.ACTIVE
    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert any(item.action == "admin.company.reactivated" for item in audits)
    assert session.committed


def test_set_status_noop_when_unchanged() -> None:
    principal = make_principal()
    company = FakeSession().company
    company.id = principal.company_id
    company.status = CompanyStatus.ACTIVE
    session = FakeSession(company=company)

    asyncio.run(set_company_status(session, principal, CompanyStatus.ACTIVE))

    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert audits == []
    assert not session.committed
