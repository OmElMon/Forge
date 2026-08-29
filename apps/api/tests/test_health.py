from fastapi.testclient import TestClient

from app.api.v1.endpoints.health import api_version, migration_head
from app.db.session import get_db
from app.main import app

LATEST_MIGRATION = "20260830_0020"
STALE_MIGRATION = "20260827_0017"


def test_health_reports_identity_and_version() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["app"] == "CrewPilot OS API"
    assert payload["version"] == api_version()
    assert "timestamp" in payload


def test_migration_head_matches_latest_revision() -> None:
    assert migration_head() == LATEST_MIGRATION


class FakeRevisionResult:
    def __init__(self, revision: str) -> None:
        self.revision = revision

    def scalar_one_or_none(self) -> str:
        return self.revision


class FakeSession:
    def __init__(self, revision: str) -> None:
        self.revision = revision
        self.failing = False

    async def execute(self, statement):
        if self.failing:
            raise ConnectionRefusedError("connection refused")
        if "alembic_version" in str(statement):
            return FakeRevisionResult(self.revision)
        return FakeRevisionResult("1")


async def healthy_db_override():
    yield FakeSession(LATEST_MIGRATION)


async def stale_db_override():
    yield FakeSession(STALE_MIGRATION)


async def failing_db_override():
    session = FakeSession(LATEST_MIGRATION)
    session.failing = True
    yield session


class Client:
    def __init__(self, override) -> None:
        app.dependency_overrides[get_db] = override
        self.client = TestClient(app)

    def __enter__(self):
        return self.client

    def __exit__(self, *args: object) -> None:
        app.dependency_overrides.clear()


def test_status_reports_database_and_migration_health() -> None:
    with Client(healthy_db_override) as client:
        response = client.get("/api/v1/status")

    payload = response.json()
    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["app"] == "CrewPilot OS API"
    assert payload["checks"]["database"]["status"] == "ok"
    assert isinstance(payload["checks"]["database"]["latency_ms"], float)
    assert payload["checks"]["migrations"]["current"] == LATEST_MIGRATION
    assert payload["checks"]["migrations"]["head"] == LATEST_MIGRATION
    assert payload["checks"]["migrations"]["status"] == "ok"
    assert "environment" in payload
    assert "started_at" in payload
    assert "version" in payload


def test_status_returns_degraded_when_migrations_drift() -> None:
    with Client(stale_db_override) as client:
        response = client.get("/api/v1/status")

    payload = response.json()
    assert response.status_code == 503
    assert payload["status"] == "degraded"
    assert payload["checks"]["database"]["status"] == "ok"
    assert payload["checks"]["migrations"]["status"] == "drift"


def test_status_returns_degraded_with_detail_when_database_fails() -> None:
    with Client(failing_db_override) as client:
        response = client.get("/api/v1/status")

    payload = response.json()
    assert response.status_code == 503
    assert payload["status"] == "degraded"
    assert payload["checks"]["database"]["status"] == "error"
    assert "detail" in payload["checks"]["database"]
    assert "ConnectionRefusedError" in payload["checks"]["database"]["detail"]


def test_ready_passes_when_database_and_migrations_healthy() -> None:
    with Client(healthy_db_override) as client:
        response = client.get("/api/v1/ready")

    payload = response.json()
    assert response.status_code == 200
    assert payload["status"] == "ready"
    assert payload["checks"]["database"] == "ok"
    assert payload["checks"]["migrations"] == "ok"


def test_ready_degraded_on_migration_drift() -> None:
    with Client(stale_db_override) as client:
        response = client.get("/api/v1/ready")

    payload = response.json()
    assert response.status_code == 503
    assert payload["status"] == "degraded"
    assert payload["checks"]["migrations"] == "drift"


def test_ready_fails_when_database_unreachable() -> None:
    with Client(failing_db_override) as client:
        response = client.get("/api/v1/ready")

    payload = response.json()
    assert response.status_code == 503
    assert payload["status"] == "degraded"
    assert payload["checks"]["database"] == "error"
