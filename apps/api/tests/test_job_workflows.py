from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.jobs import ensure_job_transition, job_audit_context
from app.models.enums import JobStatus
from app.models.job import Job


def test_job_audit_context_captures_dispatch_state() -> None:
    scheduled_start = datetime(2026, 8, 13, 14, 30, tzinfo=UTC)
    technician_id = uuid4()
    customer_id = uuid4()
    job = Job(
        id=uuid4(),
        amount_cents=18900,
        company_id=uuid4(),
        customer_id=customer_id,
        scheduled_start=scheduled_start,
        status=JobStatus.SCHEDULED,
        technician_id=technician_id,
        technician_name="Jordan Reyes",
        title="Seasonal maintenance",
    )

    assert job_audit_context(job, changed_fields=["scheduled_start"]) == {
        "amount_cents": 18900,
        "changed_fields": ["scheduled_start"],
        "customer_id": customer_id,
        "scheduled_start": "2026-08-13T14:30:00+00:00",
        "status": JobStatus.SCHEDULED,
        "technician_id": technician_id,
        "technician_name": "Jordan Reyes",
        "title": "Seasonal maintenance",
    }


def test_ensure_job_transition_rejects_invalid_status() -> None:
    job = Job(
        id=uuid4(),
        amount_cents=0,
        company_id=uuid4(),
        customer_id=uuid4(),
        status=JobStatus.COMPLETED,
        title="Completed visit",
    )

    with pytest.raises(HTTPException) as exc_info:
        ensure_job_transition(
            job,
            allowed_statuses={JobStatus.NEW, JobStatus.SCHEDULED},
            detail="Only open jobs can be changed.",
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Only open jobs can be changed."


def test_ensure_job_transition_allows_valid_status() -> None:
    job = Job(
        id=uuid4(),
        amount_cents=0,
        company_id=uuid4(),
        customer_id=uuid4(),
        status=JobStatus.SCHEDULED,
        title="Scheduled visit",
    )

    ensure_job_transition(
        job,
        allowed_statuses={JobStatus.NEW, JobStatus.SCHEDULED},
        detail="Only open jobs can be changed.",
    )
