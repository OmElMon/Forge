from uuid import uuid4

from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.enums import UserRole
from app.schemas.principal import Principal
from app.services.audit import apply_audit_filters, json_safe_context, record_audit_event


def test_json_safe_context_serializes_uuids_and_enums() -> None:
    resource_id = uuid4()

    assert json_safe_context({"role": UserRole.OWNER, "resource_id": resource_id}) == {
        "resource_id": str(resource_id),
        "role": "owner",
    }


def test_record_audit_event_creates_tenant_scoped_event() -> None:
    class FakeSession:
        def __init__(self) -> None:
            self.objects: list[object] = []

        def add(self, value: object) -> None:
            self.objects.append(value)

    principal = Principal(
        company_id=uuid4(),
        company_name="CrewPilot",
        email="owner@example.com",
        full_name="Omar Owner",
        role=UserRole.OWNER,
        user_id=uuid4(),
    )
    resource_id = uuid4()
    session = FakeSession()

    audit_log = record_audit_event(
        session,  # type: ignore[arg-type]
        principal,
        action="invoice.sent",
        context={"resource_id": resource_id},
        resource_id=resource_id,
        resource_type="invoice",
    )

    assert session.objects == [audit_log]
    assert audit_log.company_id == principal.company_id
    assert audit_log.actor_user_id == principal.user_id
    assert audit_log.action == "invoice.sent"
    assert audit_log.context == {"resource_id": str(resource_id)}


def test_apply_audit_filters_scopes_to_tenant_and_search() -> None:
    company_id = uuid4()
    actor_id = uuid4()

    query = apply_audit_filters(
        select(AuditLog),
        company_id=company_id,
        action="invoice.sent",
        resource_type="invoice",
        actor_user_id=actor_id,
        q="amount",
    )
    where = str(query.whereclause)

    assert "audit_logs.company_id" in where
    assert "audit_logs.action" in where
    assert "audit_logs.resource_type" in where
    assert "audit_logs.actor_user_id" in where
    assert "LIKE" in where.upper()


def test_apply_audit_filters_without_extra_filters_stays_tenant_scoped() -> None:
    company_id = uuid4()

    query = apply_audit_filters(select(AuditLog), company_id=company_id)
    where = str(query.whereclause)

    assert "audit_logs.company_id" in where
    assert "audit_logs.action" not in where
    assert "LIKE" not in where.upper()
