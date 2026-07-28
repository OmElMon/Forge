from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.customer import Customer
from app.models.job import Job
from app.schemas.job import JobCreate, JobRead, JobUpdate
from app.schemas.principal import Principal

router = APIRouter(prefix="/jobs", tags=["jobs"])


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
    result = await db.execute(query.order_by(Job.scheduled_start.asc().nullslast(), Job.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> Job:
    await ensure_company_customer(payload.customer_id, db, principal)
    job = Job(company_id=principal.company_id, **payload.model_dump())
    db.add(job)
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
    for field, value in updates.items():
        setattr(job, field, value)
    await db.commit()
    await db.refresh(job)
    return job
