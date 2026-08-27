from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from app.models.enums import JobStatus, TechnicianStatus
from app.models.job import Job
from app.models.technician import Technician
from app.services.workload import build_technician_workload, workload_for_technician_id

NOW = datetime(2026, 8, 27, 12, 0, 0, tzinfo=UTC)
COMPANY_ID = uuid4()


def make_technician(
    name: str = "Ada", status: TechnicianStatus = TechnicianStatus.AVAILABLE
) -> Technician:
    return Technician(
        company_id=COMPANY_ID,
        id=uuid4(),
        name=name,
        notes=None,
        skills=[],
        status=status,
    )


def make_job(
    *,
    technician_id: UUID | None = None,
    scheduled_start: datetime | None = None,
    status: JobStatus = JobStatus.NEW,
    title: str = "HVAC service",
) -> Job:
    return Job(
        amount_cents=5000,
        company_id=COMPANY_ID,
        customer_id=uuid4(),
        id=uuid4(),
        notes=None,
        required_skills=[],
        scheduled_start=scheduled_start,
        status=status,
        technician_id=technician_id,
        technician_name=None,
        title=title,
    )


def test_idle_technician_has_zero_workload() -> None:
    technician = make_technician()
    unassigned = make_job()  # not assigned to this technician

    workload = build_technician_workload(technician=technician, jobs=[unassigned], now=NOW)

    assert workload.technician_id == technician.id
    assert workload.open_job_count == 0
    assert workload.in_progress_job_count == 0
    assert workload.scheduled_job_count == 0
    assert workload.next_scheduled_start is None
    assert workload.current_job_title is None
    assert workload.computed_at == NOW


def test_open_jobs_are_counted_per_technician() -> None:
    technician = make_technician()
    jobs = [
        make_job(technician_id=technician.id, status=JobStatus.NEW),
        make_job(technician_id=technician.id, status=JobStatus.SCHEDULED),
        make_job(technician_id=uuid4(), status=JobStatus.NEW),  # other tech
        make_job(technician_id=technician.id, status=JobStatus.COMPLETED),  # not open
    ]

    workload = build_technician_workload(technician=technician, jobs=jobs)

    assert workload.open_job_count == 2


def test_in_progress_and_next_scheduled_are_surfaced() -> None:
    technician = make_technician()
    later = NOW + timedelta(hours=5)
    jobs = [
        make_job(technician_id=technician.id, status=JobStatus.IN_PROGRESS, title="Filter swap"),
        make_job(
            technician_id=technician.id,
            status=JobStatus.SCHEDULED,
            scheduled_start=later,
            title="Tune-up",
        ),
    ]

    workload = build_technician_workload(technician=technician, jobs=jobs)

    assert workload.in_progress_job_count == 1
    assert workload.current_job_title == "Filter swap"
    assert workload.scheduled_job_count == 1
    assert workload.next_scheduled_start == later


def test_workload_for_technician_id_finds_and_misses() -> None:
    technician = make_technician()
    other = make_technician(name="Grace")
    jobs = [make_job(technician_id=technician.id, status=JobStatus.IN_PROGRESS)]

    found = workload_for_technician_id(
        technician_id=technician.id,
        technicians=[technician, other],
        jobs=jobs,
    )
    missing = workload_for_technician_id(
        technician_id=uuid4(),
        technicians=[technician, other],
        jobs=jobs,
    )

    assert found is not None
    assert found.technician_name == "Ada"
    assert found.open_job_count == 1
    assert missing is None


def test_unscheduled_new_job_counts_as_open_not_scheduled() -> None:
    technician = make_technician()
    jobs = [make_job(technician_id=technician.id, status=JobStatus.NEW)]

    workload = build_technician_workload(technician=technician, jobs=jobs)

    assert workload.open_job_count == 1
    assert workload.scheduled_job_count == 0
    assert workload.next_scheduled_start is None
