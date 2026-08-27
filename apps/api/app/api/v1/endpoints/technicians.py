from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.enums import DomainAggregateType, DomainEventType
from app.models.job import Job
from app.models.technician import Technician
from app.schemas.principal import Principal
from app.schemas.technician import (
    TechnicianCreate,
    TechnicianRead,
    TechnicianUpdate,
    TechnicianWorkload,
)
from app.services.dispatch import OPEN_JOB_STATUSES
from app.services.events import emit_domain_event
from app.services.workload import build_technician_workload

router = APIRouter(prefix="/technicians", tags=["technicians"])


def technician_event_payload(technician: Technician, **extra: object) -> dict[str, object]:
    return {
        "name": technician.name,
        "status": technician.status,
        "skills": technician.skills,
        **extra,
    }


async def get_company_technician(
    technician_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> Technician:
    result = await db.execute(
        select(Technician).where(
            Technician.id == technician_id,
            Technician.company_id == principal.company_id,
        )
    )
    technician = result.scalar_one_or_none()
    if technician is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found.")
    return technician


@router.get("", response_model=list[TechnicianRead])
async def list_technicians(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[Technician]:
    result = await db.execute(
        select(Technician)
        .where(Technician.company_id == principal.company_id)
        .order_by(Technician.name.asc())
    )
    return list(result.scalars().all())


@router.post("", response_model=TechnicianRead, status_code=status.HTTP_201_CREATED)
async def create_technician(
    payload: TechnicianCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Technician:
    technician = Technician(company_id=principal.company_id, **payload.model_dump())
    db.add(technician)
    await db.flush()
    emit_domain_event(
        db,
        principal,
        aggregate_id=technician.id,
        aggregate_type=DomainAggregateType.TECHNICIAN,
        event_type=DomainEventType.TECHNICIAN_CREATED,
        payload=technician_event_payload(technician),
    )
    await db.commit()
    await db.refresh(technician)
    return technician


@router.get("/{technician_id}", response_model=TechnicianRead)
async def read_technician(
    technician_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Technician:
    return await get_company_technician(technician_id, db, principal)


@router.get("/{technician_id}/workload", response_model=TechnicianWorkload)
async def read_technician_workload(
    technician_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> TechnicianWorkload:
    technician = await get_company_technician(technician_id, db, principal)
    jobs_result = await db.execute(
        select(Job).where(
            Job.company_id == principal.company_id,
            Job.technician_id == technician_id,
            Job.status.in_(OPEN_JOB_STATUSES),
        )
    )
    return build_technician_workload(
        technician=technician,
        jobs=jobs_result.scalars().all(),  # type: ignore[arg-type]
    )


@router.patch("/{technician_id}", response_model=TechnicianRead)
async def update_technician(
    technician_id: UUID,
    payload: TechnicianUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Technician:
    technician = await get_company_technician(technician_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    previous_status = technician.status
    changed_fields = sorted(updates)
    for field, value in updates.items():
        setattr(technician, field, value)
    event_type = (
        DomainEventType.TECHNICIAN_AVAILABILITY_CHANGED
        if "status" in updates and technician.status != previous_status
        else DomainEventType.TECHNICIAN_UPDATED
    )
    emit_domain_event(
        db,
        principal,
        aggregate_id=technician.id,
        aggregate_type=DomainAggregateType.TECHNICIAN,
        event_type=event_type,
        payload=technician_event_payload(
            technician,
            changed_fields=changed_fields,
            previous_status=previous_status,
        ),
    )
    await db.commit()
    await db.refresh(technician)
    return technician
