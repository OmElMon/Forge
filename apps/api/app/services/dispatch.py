from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from app.models.enums import JobStatus, TechnicianStatus
from app.models.job import Job
from app.models.technician import Technician
from app.schemas.dispatch import DispatchSuggestion

JOB_WINDOW_HOURS = 3
OPEN_JOB_STATUSES = {JobStatus.NEW, JobStatus.SCHEDULED, JobStatus.IN_PROGRESS}

AVAILABILITY_PENALTY = {
    TechnicianStatus.AVAILABLE: 0.0,
    TechnicianStatus.ON_JOB: 0.15,
    TechnicianStatus.OFF_TODAY: 0.3,
}


def windows_overlap(
    primary: datetime, other: datetime, window_hours: int = JOB_WINDOW_HOURS
) -> bool:
    return abs((primary - other).total_seconds()) <= window_hours * 3600


def count_assignable_conflicts(
    job: Job,
    technicians: Sequence[Technician],
    jobs: Sequence[Job],
) -> dict[UUID, int]:
    """Count each technician's open jobs overlapping the target job's window.

    Uses the scheduled window when the job has one; otherwise falls back to the
    tech's overall open-job load.
    """
    conflicts: dict[UUID, int] = {}
    for technician in technicians:
        assigned = [
            other
            for other in jobs
            if other.id != job.id
            and other.technician_id == technician.id
            and other.status in OPEN_JOB_STATUSES
        ]
        if job.scheduled_start is not None:
            count = sum(
                1
                for other in assigned
                if other.scheduled_start is not None
                and windows_overlap(job.scheduled_start, other.scheduled_start)
            )
        else:
            count = len(assigned)
        conflicts[technician.id] = count
    return conflicts


def suggest_technicians(
    *,
    job: Job,
    technicians: Sequence[Technician],
    jobs: Sequence[Job],
    limit: int = 3,
) -> list[DispatchSuggestion]:
    """Rank technicians for a job by skill fit, availability, and schedule load."""
    conflicts = count_assignable_conflicts(job, technicians, jobs)
    suggestions = [
        _score_technician(job, technician, conflicts.get(technician.id, 0))
        for technician in technicians
    ]
    suggestions.sort(key=lambda suggestion: (-suggestion.confidence, suggestion.technician_name))
    return suggestions[:limit]


def _score_technician(job: Job, technician: Technician, conflicts: int) -> DispatchSuggestion:
    technician_skills = set(technician.skills or [])
    required_set = set(job.required_skills or [])
    skill_match = sorted(required_set & technician_skills)
    skill_missing = sorted(required_set - technician_skills)

    confidence = 1.0
    reasons: list[str] = []

    if required_set:
        ratio = len(skill_match) / len(required_set)
        confidence *= 0.5 + 0.5 * ratio
        if skill_missing:
            reasons.append(f"missing skill: {', '.join(skill_missing)}")

    penalty = AVAILABILITY_PENALTY.get(technician.status, 0.0)
    if penalty > 0:
        confidence -= penalty
        if technician.status == TechnicianStatus.ON_JOB:
            reasons.append("currently on a job")
        elif technician.status == TechnicianStatus.OFF_TODAY:
            reasons.append("off today")

    load_penalty = min(0.4, conflicts * 0.1)
    if load_penalty > 0:
        confidence -= load_penalty
        reasons.append(f"{conflicts} overlapping job{'s' if conflicts != 1 else ''}")

    return DispatchSuggestion(
        confidence=round(max(0.0, min(1.0, confidence)), 3),
        load_conflicts=conflicts,
        reasons=reasons,
        skill_match=skill_match,
        skill_missing=skill_missing,
        status=technician.status,
        technician_id=technician.id,
        technician_name=technician.name,
    )
