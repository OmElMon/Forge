from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app


def test_health() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


class FakeRevisionResult:
    def __init__(self, revision: str) -> None:
        self.revision = revision

    def scalar_one_or_none(self) -> str:
        return self.revision


class FakeSession:
    def __init__(self, revision: str) -> None:
        self.revision = revision

    async def execute(self, statement):
        if "alembic_version" in str(statement):
            return FakeRevisionResult(self.revision)
        return FakeRevisionResult("1")


async def healthy_db_override():
    yield FakeSession("20260827_0011")


async def stale_db_override():
    yield FakeSession("20260827_0010")


def test_status_reports_database_and_migration_health() -> None:
    app.dependency_overrides[get_db] = healthy_db_override
    try:
        response = TestClient(app).get("/api/v1/status")
    finally:
        app.dependency_overrides.clear()

    payload = response.json()
    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["app"] == "CrewPilot OS API"
    assert payload["checks"]["database"]["status"] == "ok"
    assert payload["checks"]["migrations"]["current"] == "20260827_0011"
    assert payload["checks"]["migrations"]["head"] == "20260827_0011"
    assert payload["checks"]["migrations"]["status"] == "ok"


def test_status_returns_degraded_when_migrations_drift() -> None:
    app.dependency_overrides[get_db] = stale_db_override
    try:
        response = TestClient(app).get("/api/v1/status")
    finally:
        app.dependency_overrides.clear()

    payload = response.json()
    assert response.status_code == 503
    assert payload["status"] == "degraded"
    assert payload["checks"]["database"]["status"] == "ok"
    assert payload["checks"]["migrations"]["status"] == "drift"
