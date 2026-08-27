from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.models.job import Job
from app.models.technician import Technician
from app.schemas.dispatch import DispatchSuggestion
from app.schemas.principal import Principal
from app.services.dispatch import OPEN_JOB_STATUSES, suggest_technicians

router = APIRouter(prefix="/dispatch", tags=["dispatch"])


@router.get("/suggestions", response_model=list[DispatchSuggestion])
async def dispatch_suggestions(
    job_id: UUID = Query(description="Job to recommend technicians for"),
    limit: int = Query(default=3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[DispatchSuggestion]:
    job_result = await db.execute(
        select(Job).where(
            Job.id == job_id,
            Job.company_id == principal.company_id,
        )
    )
    job = job_result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if job.status not in OPEN_JOB_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dispatch suggestions only apply to open jobs.",
        )

    technicians_result = await db.execute(
        select(Technician).where(Technician.company_id == principal.company_id)
    )
    jobs_result = await db.execute(
        select(Job).where(
            Job.company_id == principal.company_id,
            Job.status.in_(OPEN_JOB_STATUSES),
        )
    )
    return suggest_technicians(
        job=job,
        technicians=technicians_result.scalars().all(),  # type: ignore[arg-type]
        jobs=jobs_result.scalars().all(),  # type: ignore[arg-type]
        limit=limit,
    )
