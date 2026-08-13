from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.customer import Customer
from app.models.enums import JobStatus
from app.models.job import Job
from app.models.technician import Technician
from app.schemas.job import JobAssignment, JobCreate, JobRead, JobSchedule, JobUpdate
from app.schemas.principal import Principal
from app.services.audit import record_audit_event

router = APIRouter(prefix="/jobs", tags=["jobs"])


def job_audit_context(job: Job, **extra: object) -> dict[str, object]:
    return {
        "amount_cents": job.amount_cents,
        "customer_id": job.customer_id,
        "scheduled_start": job.scheduled_start.isoformat() if job.scheduled_start else None,
        "status": job.status,
        "technician_id": job.technician_id,
        "technician_name": job.technician_name,
        "title": job.title,
        **extra,
    }


def ensure_job_transition(
    job: Job,
    *,
    allowed_statuses: set[JobStatus],
    detail: str,
) -> None:
    if job.status not in allowed_statuses:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


async def ensure_company_customer(
    customer_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> None:
    result = await db.execute(
        select(Customer.id).where(
            Customer.id == customer_id,
            Customer.company_id == principal.company_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")


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


async def get_company_job(
    job_id: UUID,
    db: AsyncSession,
    principal: Principal,
) -> Job:
    result = await db.execute(
        select(Job).where(
            Job.id == job_id,
            Job.company_id == principal.company_id,
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return job


@router.get("", response_model=list[JobRead])
async def list_jobs(
    customer_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[Job]:
    query = select(Job).where(Job.company_id == principal.company_id)
    if customer_id is not None:
        query = query.where(Job.customer_id == customer_id)
    result = await db.execute(
        query.order_by(Job.scheduled_start.asc().nullslast(), Job.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    await ensure_company_customer(payload.customer_id, db, principal)
    data = payload.model_dump()
    technician_id = data.get("technician_id")
    if technician_id is not None:
        technician = await get_company_technician(technician_id, db, principal)
        data["technician_name"] = technician.name
    job = Job(company_id=principal.company_id, **data)
    db.add(job)
    await db.flush()
    record_audit_event(
        db,
        principal,
        action="job.created",
        context=job_audit_context(job),
        resource_id=job.id,
        resource_type="job",
    )
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobRead)
async def read_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    return await get_company_job(job_id, db, principal)


@router.patch("/{job_id}", response_model=JobRead)
async def update_job(
    job_id: UUID,
    payload: JobUpdate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    job = await get_company_job(job_id, db, principal)
    updates = payload.model_dump(exclude_unset=True)
    if "customer_id" in updates:
        await ensure_company_customer(updates["customer_id"], db, principal)
    if updates.get("technician_id") is not None:
        technician = await get_company_technician(updates["technician_id"], db, principal)
        updates["technician_name"] = technician.name
    elif "technician_id" in updates and updates["technician_id"] is None:
        updates["technician_name"] = None
    changed_fields = sorted(updates)
    for field, value in updates.items():
        setattr(job, field, value)
    record_audit_event(
        db,
        principal,
        action="job.updated",
        context=job_audit_context(job, changed_fields=changed_fields),
        resource_id=job.id,
        resource_type="job",
    )
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/schedule", response_model=JobRead)
async def schedule_job(
    job_id: UUID,
    payload: JobSchedule,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    job = await get_company_job(job_id, db, principal)
    ensure_job_transition(
        job,
        allowed_statuses={JobStatus.NEW, JobStatus.SCHEDULED},
        detail="Only new or scheduled jobs can be scheduled.",
    )
    job.scheduled_start = payload.scheduled_start
    job.status = JobStatus.SCHEDULED
    if payload.technician_id is not None:
        technician = await get_company_technician(payload.technician_id, db, principal)
        job.technician_id = technician.id
        job.technician_name = technician.name
    record_audit_event(
        db,
        principal,
        action="job.scheduled",
        context=job_audit_context(job),
        resource_id=job.id,
        resource_type="job",
    )
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/assign", response_model=JobRead)
async def assign_job(
    job_id: UUID,
    payload: JobAssignment,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    job = await get_company_job(job_id, db, principal)
    ensure_job_transition(
        job,
        allowed_statuses={JobStatus.NEW, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS},
        detail="Completed or canceled jobs cannot be reassigned.",
    )
    technician = await get_company_technician(payload.technician_id, db, principal)
    job.technician_id = technician.id
    job.technician_name = technician.name
    record_audit_event(
        db,
        principal,
        action="job.assigned",
        context=job_audit_context(job),
        resource_id=job.id,
        resource_type="job",
    )
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/start", response_model=JobRead)
async def start_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    job = await get_company_job(job_id, db, principal)
    ensure_job_transition(
        job,
        allowed_statuses={JobStatus.NEW, JobStatus.SCHEDULED},
        detail="Only new or scheduled jobs can be started.",
    )
    job.status = JobStatus.IN_PROGRESS
    record_audit_event(
        db,
        principal,
        action="job.started",
        context=job_audit_context(job),
        resource_id=job.id,
        resource_type="job",
    )
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/complete", response_model=JobRead)
async def complete_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    job = await get_company_job(job_id, db, principal)
    ensure_job_transition(
        job,
        allowed_statuses={JobStatus.SCHEDULED, JobStatus.IN_PROGRESS},
        detail="Only scheduled or in-progress jobs can be completed.",
    )
    job.status = JobStatus.COMPLETED
    record_audit_event(
        db,
        principal,
        action="job.completed",
        context=job_audit_context(job),
        resource_id=job.id,
        resource_type="job",
    )
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/cancel", response_model=JobRead)
async def cancel_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    job = await get_company_job(job_id, db, principal)
    ensure_job_transition(
        job,
        allowed_statuses={JobStatus.NEW, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS},
        detail="Completed or canceled jobs cannot be canceled.",
    )
    job.status = JobStatus.CANCELED
    record_audit_event(
        db,
        principal,
        action="job.canceled",
        context=job_audit_context(job),
        resource_id=job.id,
        resource_type="job",
    )
    await db.commit()
    await db.refresh(job)
    return job
