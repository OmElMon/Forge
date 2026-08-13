from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.schemas.principal import Principal


def json_safe_context(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {key: json_safe_context(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe_context(item) for item in value]
    if hasattr(value, "value"):
        return value.value
    return value


def record_audit_event(
    db: AsyncSession,
    principal: Principal,
    *,
    action: str,
    resource_type: str,
    resource_id: UUID | None,
    context: dict[str, Any] | None = None,
) -> AuditLog:
    audit_log = AuditLog(
        action=action,
        actor_user_id=principal.user_id,
        company_id=principal.company_id,
        context=json_safe_context(context or {}),
        resource_id=resource_id,
        resource_type=resource_type,
    )
    db.add(audit_log)
    return audit_log
