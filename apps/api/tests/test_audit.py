from uuid import uuid4

from app.models.enums import UserRole
from app.schemas.principal import Principal
from app.services.audit import json_safe_context, record_audit_event


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
