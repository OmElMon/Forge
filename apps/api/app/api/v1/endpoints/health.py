from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db

router = APIRouter(tags=["health"])

PROCESS_STARTED_AT = datetime.now(UTC)


def api_version() -> str:
    try:
        return version("forge-api")
    except PackageNotFoundError:
        return "0.1.0"


def migration_head() -> str | None:
    # Resolve the Alembic versions directory relative to this module so the head
    # is stable regardless of the process working directory in deployed images.
    module_versions = Path(__file__).resolve().parents[4] / "alembic" / "versions"
    versions_dir = (
        module_versions if module_versions.is_dir() else Path.cwd() / "alembic" / "versions"
    )
    if not versions_dir.is_dir():
        return None

    revisions = sorted(
        path.name.split("_", maxsplit=2)[:2]
        for path in versions_dir.glob("*.py")
        if path.name != "__init__.py"
    )
    if not revisions:
        return None
    return "_".join(revisions[-1])


def _sanitized_error(exc: Exception) -> str:
    message = str(exc)
    if len(message) > 120:
        message = message[:117] + "..."
    return f"{type(exc).__name__}: {message}"


async def _database_check(db: AsyncSession) -> tuple[dict[str, Any], str | None]:
    started_at = perf_counter()
    current_revision: str | None = None
    database_status = "ok"
    detail: str | None = None

    try:
        await db.execute(text("SELECT 1"))
        revision_result = await db.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
        current_revision = revision_result.scalar_one_or_none()
    except Exception as exc:  # noqa: BLE001 - status endpoints must never raise
        database_status = "error"
        detail = _sanitized_error(exc)

    latency_ms = round((perf_counter() - started_at) * 1000, 2)
    check: dict[str, Any] = {"latency_ms": latency_ms, "status": database_status}
    if detail:
        check["detail"] = detail
    return check, current_revision


@router.get("/health")
async def health() -> dict[str, object]:
    return {
        "app": settings.app_name,
        "status": "ok",
        "timestamp": datetime.now(UTC).isoformat(),
        "version": api_version(),
    }


@router.get("/ready")
async def readiness(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    database_check, current_revision = await _database_check(db)
    head_revision = migration_head()
    migrations_status = "unknown"
    if current_revision and head_revision:
        migrations_status = "ok" if current_revision == head_revision else "drift"

    overall_status = "ready"
    if database_check["status"] != "ok" or migrations_status == "drift":
        overall_status = "degraded"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "checks": {
            "database": database_check["status"],
            "migrations": migrations_status,
        },
        "status": overall_status,
    }


@router.get("/status")
async def production_status(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    database_check, current_revision = await _database_check(db)
    head_revision = migration_head()
    migrations_status = "unknown"
    if current_revision and head_revision:
        migrations_status = "ok" if current_revision == head_revision else "drift"

    overall_status = "ok"
    if database_check["status"] != "ok" or migrations_status == "drift":
        overall_status = "degraded"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "app": settings.app_name,
        "checks": {
            "database": database_check,
            "migrations": {
                "current": current_revision,
                "head": head_revision,
                "status": migrations_status,
            },
        },
        "environment": settings.environment,
        "started_at": PROCESS_STARTED_AT.isoformat(),
        "status": overall_status,
        "timestamp": datetime.now(UTC).isoformat(),
        "version": api_version(),
    }
