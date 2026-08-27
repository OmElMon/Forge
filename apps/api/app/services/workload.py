from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from app.models.enums import JobStatus
from app.models.job import Job
from app.models.technician import Technician
from app.schemas.technician import TechnicianWorkload
from app.services.dispatch import OPEN_JOB_STATUSES


def build_technician_workload(
    *,
    technician: Technician,
    jobs: Sequence[Job],
    now: datetime | None = None,
) -> TechnicianWorkload:
    """Signal a technician's current workload from their open jobs.

    Counts open, in-progress, and scheduled jobs; surfaces the next scheduled
    start and the title of the job currently in progress. Read-only derivation
    from already-loaded records, so it stays unit-testable without a session.
    """
    assigned = [
        job
        for job in jobs
        if job.technician_id == technician.id and job.status in OPEN_JOB_STATUSES
    ]
    in_progress = [job for job in assigned if job.status == JobStatus.IN_PROGRESS]
    scheduled = [
        job
        for job in assigned
        if job.status in (JobStatus.SCHEDULED, JobStatus.NEW) and job.scheduled_start is not None
    ]

    next_scheduled_start = min((job.scheduled_start for job in scheduled), default=None)
    current_job_title = in_progress[0].title if in_progress else None

    return TechnicianWorkload(
        technician_id=technician.id,
        technician_name=technician.name,
        status=technician.status,
        open_job_count=len(assigned),
        in_progress_job_count=len(in_progress),
        scheduled_job_count=len(scheduled),
        next_scheduled_start=next_scheduled_start,
        current_job_title=current_job_title,
        computed_at=now,
    )


def workload_for_technician_id(
    *,
    technician_id: UUID,
    technicians: Sequence[Technician],
    jobs: Sequence[Job],
    now: datetime | None = None,
) -> TechnicianWorkload | None:
    for technician in technicians:
        if technician.id == technician_id:
            return build_technician_workload(technician=technician, jobs=jobs, now=now)
    return None
