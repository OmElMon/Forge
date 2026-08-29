from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import BACK_OFFICE_ROLES, get_principal, require_roles
from app.db.session import get_db
from app.models.enums import (
    DomainAggregateType,
    DomainEventType,
    IntakeRecordKind,
    IntakeRecordStatus,
)
from app.models.intake_record import IntakeRecord
from app.schemas.customer import CustomerRead
from app.schemas.intake import IntakeRecordCreate, IntakeRecordRead, IntakeRecordUpdate
from app.schemas.principal import Principal
from app.services.audit import record_audit_event
from app.services.events import emit_domain_event
from app.services.intake import (
    convert_intake_record,
    get_company_intake_record,
    intake_event_payload,
)

router = APIRouter(prefix="/intake", tags=["intake"])


@router.post("", response_model=IntakeRecordRead, status_code=status.HTTP_201_CREATED)
async def create_intake_record(
    payload: IntakeRecordCreate = Body(...),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> IntakeRecord:
    record = IntakeRecord(company_id=principal.company_id, **payload.model_dump())
    db.add(record)
    await db.flush()
    record_audit_event(
        db,
        principal,
        action="intake.record.created",
        context=intake_event_payload(record),
        resource_id=record.id,
        resource_type="intake",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=record.id,
        aggregate_type=DomainAggregateType.INTAKE,
        event_type=DomainEventType.INTAKE_RECORD_CREATED,
        payload=intake_event_payload(record),
    )
    await db.commit()
    await db.refresh(record)
    return record


@router.get("", response_model=list[IntakeRecordRead])
async def list_intake_records(
    status_filter: IntakeRecordStatus | None = Query(default=None, alias="status"),
    kind: IntakeRecordKind | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[IntakeRecord]:
    query = select(IntakeRecord).where(IntakeRecord.company_id == principal.company_id)
    if status_filter is not None:
        query = query.where(IntakeRecord.status == status_filter)
    if kind is not None:
        query = query.where(IntakeRecord.kind == kind)
    result = await db.execute(query.order_by(IntakeRecord.created_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.patch("/{record_id}", response_model=IntakeRecordRead)
async def update_intake_record(
    record_id: UUID,
    payload: IntakeRecordUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> IntakeRecord:
    record = await get_company_intake_record(record_id, db, principal)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Intake record not found."
        )
    fields = payload.model_dump(exclude_unset=True)
    for field, value in fields.items():
        setattr(record, field, value)
    await db.flush()
    record_audit_event(
        db,
        principal,
        action="intake.record.updated",
        context=intake_event_payload(record),
        resource_id=record.id,
        resource_type="intake",
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=record.id,
        aggregate_type=DomainAggregateType.INTAKE,
        event_type=DomainEventType.INTAKE_RECORD_UPDATED,
        payload={**fields, "status": record.status.value},
    )
    await db.commit()
    await db.refresh(record)
    return record


@router.post(
    "/{record_id}/convert", response_model=CustomerRead, status_code=status.HTTP_201_CREATED
)
async def convert_intake_record_endpoint(
    record_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_roles(*BACK_OFFICE_ROLES)),
) -> CustomerRead:
    record = await get_company_intake_record(record_id, db, principal)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Intake record not found."
        )
    if record.status == IntakeRecordStatus.CONVERTED and record.customer_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This intake record is already converted.",
        )
    return await convert_intake_record(record, db, principal)
