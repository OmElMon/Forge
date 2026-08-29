from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.audit import AuditLog
from app.schemas.audit import AuditLogRead
from app.schemas.principal import Principal
from app.services.audit import apply_audit_filters

router = APIRouter(prefix="/audit-logs", tags=["audit logs"])


@router.get("", response_model=list[AuditLogRead])
async def list_audit_logs(
    action: str | None = Query(default=None, max_length=120),
    resource_type: str | None = Query(default=None, max_length=80),
    resource_id: UUID | None = Query(default=None),
    actor_user_id: UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[AuditLog]:
    query = apply_audit_filters(
        select(AuditLog),
        company_id=principal.company_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_user_id=actor_user_id,
        q=q,
    )
    result = await db.execute(query.order_by(AuditLog.created_at.desc()).limit(limit))
    return list(result.scalars().all())
