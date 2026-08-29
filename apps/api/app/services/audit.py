from typing import Any
from uuid import UUID

from sqlalchemy import Select, Text, cast, or_
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


def apply_audit_filters(
    query: Select,
    *,
    company_id: UUID,
    action: str | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    q: str | None = None,
) -> Select:
    """Scope an audit-log query to a tenant and apply optional search filters."""
    query = query.where(AuditLog.company_id == company_id)
    if action is not None:
        query = query.where(AuditLog.action == action)
    if resource_type is not None:
        query = query.where(AuditLog.resource_type == resource_type)
    if resource_id is not None:
        query = query.where(AuditLog.resource_id == resource_id)
    if actor_user_id is not None:
        query = query.where(AuditLog.actor_user_id == actor_user_id)
    if q:
        query = query.where(
            or_(
                AuditLog.action.ilike(f"%{q}%"),
                AuditLog.resource_type.ilike(f"%{q}%"),
                cast(AuditLog.context, Text).ilike(f"%{q}%"),
            )
        )
    return query
