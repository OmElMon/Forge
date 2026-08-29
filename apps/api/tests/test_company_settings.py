import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.audit import AuditLog
from app.models.company import Company
from app.models.enums import UserRole
from app.schemas.company import CompanyUpdate
from app.schemas.principal import Principal
from app.services.company import get_workspace_company, update_company_profile


class FakeSession:
    def __init__(self, company: Company | None = None) -> None:
        self.objects: list[object] = []
        self.company = company or Company(
            name="Ace Plumbing",
            slug="ace-plumbing",
            timezone="America/New_York",
            service_area=None,
            default_trade=None,
            notification_prefs={},
        )
        self.company.id = self.company.id or uuid4()
        self.committed = False

    def add(self, value: object) -> None:
        self.objects.append(value)

    async def get(self, _model: type[object], ident: object) -> object:
        return self.company if ident == self.company.id else None

    async def flush(self) -> None:  # noqa: D102
        return None

    async def commit(self) -> None:  # noqa: D102
        self.committed = True


def make_principal(*, role: UserRole = UserRole.OWNER) -> Principal:
    return Principal(
        user_id=uuid4(),
        company_id=uuid4(),
        email="owner@example.com",
        full_name="Omar Owner",
        company_name="Ace Plumbing",
        role=role,
    )


def test_update_profile_requires_owner_or_admin() -> None:
    session = FakeSession()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            update_company_profile(
                session,
                make_principal(role=UserRole.TECHNICIAN),
                CompanyUpdate(name="Ace Plumbing 2"),
            )
        )
    assert exc.value.status_code == 403


def test_update_profile_writes_fields_and_audits() -> None:
    principal = make_principal()
    company = FakeSession().company
    company.id = principal.company_id
    session = FakeSession(company=company)

    result = asyncio.run(
        update_company_profile(
            session,
            principal,
            CompanyUpdate(
                name="Ace Heating & Cooling",
                timezone="America/Chicago",
                service_area="Nashville + Franklin",
                default_trade="hvac",
                notification_prefs={"followup_reminders": False},
            ),
        )
    )

    assert result is company
    assert result.name == "Ace Heating & Cooling"
    assert result.timezone == "America/Chicago"
    assert result.service_area == "Nashville + Franklin"
    assert result.default_trade == "hvac"
    assert result.notification_prefs == {"followup_reminders": False}
    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert any(
        item.action == "company.profile.updated" and item.resource_id == company.id
        for item in audits
    )
    assert {"name", "timezone", "service_area", "default_trade", "notification_prefs"} <= set(
        audits[0].context["fields"]
    )
    assert session.committed


def test_update_profile_no_change_skips_audit() -> None:
    principal = make_principal()
    company = FakeSession().company
    company.id = principal.company_id
    session = FakeSession(company=company)

    asyncio.run(
        update_company_profile(
            session, principal, CompanyUpdate(name="Ace Plumbing", timezone="America/New_York")
        )
    )

    audits = [item for item in session.objects if isinstance(item, AuditLog)]
    assert audits == []
    assert not session.committed


def test_get_workspace_company_not_found() -> None:
    session = FakeSession()
    session.company.id = uuid4()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_workspace_company(session, uuid4()))
    assert exc.value.status_code == 404


def test_get_workspace_company_scoped_to_principal() -> None:
    session = FakeSession()
    session.company.id = uuid4()
    company = asyncio.run(get_workspace_company(session, session.company.id))
    assert company is session.company


def test_company_update_trims_text_and_collapses_blank_values() -> None:
    payload = CompanyUpdate(name="  Ace   ", service_area="  ", default_trade=None)
    assert payload.name == "Ace"
    assert payload.service_area is None
    assert payload.default_trade is None


def test_company_update_rejects_invalid_timezone() -> None:
    with pytest.raises(ValidationError):
        CompanyUpdate(timezone="Not/A Zone!")


def test_company_update_accepts_iana_timezone() -> None:
    assert CompanyUpdate(timezone="America/Los_Angeles").timezone == "America/Los_Angeles"
