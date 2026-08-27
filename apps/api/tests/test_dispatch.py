from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from app.models.enums import JobStatus, TechnicianStatus
from app.models.job import Job
from app.models.technician import Technician
from app.services.dispatch import count_assignable_conflicts, suggest_technicians, windows_overlap

NOW = datetime(2026, 8, 27, 12, 0, 0, tzinfo=UTC)
COMPANY_ID = uuid4()


def make_technician(name: str, *, skills: list[str], status: TechnicianStatus) -> Technician:
    return Technician(
        company_id=COMPANY_ID,
        id=uuid4(),
        name=name,
        notes=None,
        skills=skills,
        status=status,
    )


def make_job(
    *,
    technician_id: UUID | None = None,
    scheduled_start: datetime | None = None,
    required_skills: list[str] | None = None,
    status: JobStatus = JobStatus.NEW,
) -> Job:
    return Job(
        amount_cents=5000,
        company_id=COMPANY_ID,
        customer_id=uuid4(),
        id=uuid4(),
        notes=None,
        required_skills=required_skills or [],
        scheduled_start=scheduled_start,
        status=status,
        technician_id=technician_id,
        technician_name=None,
        title="HVAC service",
    )


def test_windows_overlap_uses_hourly_window() -> None:
    assert windows_overlap(NOW, NOW + timedelta(hours=2)) is True
    assert windows_overlap(NOW, NOW - timedelta(hours=4)) is False


def test_skill_fit_ranks_matching_technician_first() -> None:
    thermostat_tech = make_technician(
        "Priya", skills=["thermostats", "controls"], status=TechnicianStatus.AVAILABLE
    )
    general_tech = make_technician(
        "Dana", skills=["maintenance", "tune-ups"], status=TechnicianStatus.AVAILABLE
    )
    job = make_job(required_skills=["thermostats", "controls"])

    suggestions = suggest_technicians(job=job, technicians=[thermostat_tech, general_tech], jobs=[])

    assert suggestions[0].technician_name == "Priya"
    assert suggestions[0].skill_match == ["controls", "thermostats"]
    assert suggestions[0].confidence > suggestions[1].confidence


def test_missing_skills_are_listed_and_penalize_confidence() -> None:
    tech = make_technician("Dana", skills=["maintenance"], status=TechnicianStatus.AVAILABLE)
    job = make_job(required_skills=["air conditioning", "diagnostics"])

    suggestion = suggest_technicians(job=job, technicians=[tech], jobs=[])[0]

    assert suggestion.skill_match == []
    assert suggestion.skill_missing == ["air conditioning", "diagnostics"]
    assert suggestion.confidence < 0.6
    assert any("missing skill" in reason for reason in suggestion.reasons)


def test_off_today_technician_is_deprioritized() -> None:
    available = make_technician(
        "Dana", skills=["air conditioning"], status=TechnicianStatus.AVAILABLE
    )
    off_today = make_technician(
        "Priya", skills=["air conditioning"], status=TechnicianStatus.OFF_TODAY
    )
    job = make_job(required_skills=["air conditioning"])

    suggestions = suggest_technicians(job=job, technicians=[available, off_today], jobs=[])

    assert suggestions[0].technician_name == "Dana"
    assert "off today" in suggestions[1].reasons


def test_same_window_overlap_counts_as_load_conflict() -> None:
    tech = make_technician(
        "Jordan", skills=["air conditioning", "diagnostics"], status=TechnicianStatus.AVAILABLE
    )
    job = make_job(scheduled_start=NOW, required_skills=["air conditioning", "diagnostics"])
    other_job = make_job(
        scheduled_start=NOW + timedelta(hours=1),
        technician_id=tech.id,
        status=JobStatus.SCHEDULED,
    )
    far_job = make_job(
        scheduled_start=NOW + timedelta(days=3),
        technician_id=tech.id,
        status=JobStatus.SCHEDULED,
    )

    conflicts = count_assignable_conflicts(job, [tech], [other_job, far_job])

    assert conflicts[tech.id] == 1


def test_unscheduled_job_uses_open_load_proxy() -> None:
    tech = make_technician("Jordan", skills=["air conditioning"], status=TechnicianStatus.AVAILABLE)
    job = make_job(required_skills=["air conditioning"])
    assigned_jobs = [make_job(technician_id=tech.id, status=JobStatus.SCHEDULED) for _ in range(3)]

    conflicts = count_assignable_conflicts(job, [tech], assigned_jobs)

    assert conflicts[tech.id] == 3


def test_empty_required_skills_is_neutral() -> None:
    tech = make_technician(
        "Dana", skills=["maintenance", "tune-ups"], status=TechnicianStatus.AVAILABLE
    )
    job = make_job()

    suggestion = suggest_technicians(job=job, technicians=[tech], jobs=[])[0]

    assert suggestion.confidence == 1.0
    assert suggestion.skill_match == []
    assert suggestion.skill_missing == []
    assert suggestion.reasons == []


def test_suggestions_are_sorted_and_limited() -> None:
    technician_a = make_technician(
        "Dana", skills=["air conditioning"], status=TechnicianStatus.AVAILABLE
    )
    technician_b = make_technician(
        "Priya", skills=["thermostats"], status=TechnicianStatus.AVAILABLE
    )
    technician_c = make_technician(
        "Ari", skills=["thermostats", "controls"], status=TechnicianStatus.AVAILABLE
    )
    job = make_job(required_skills=["thermostats", "controls"])

    suggestions = suggest_technicians(
        job=job,
        technicians=[technician_a, technician_b, technician_c],
        jobs=[],
        limit=2,
    )

    assert [suggestion.technician_name for suggestion in suggestions] == ["Ari", "Priya"]
    assert len(suggestions) == 2
