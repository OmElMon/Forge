from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from time import perf_counter

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db

router = APIRouter(tags=["health"])


def api_version() -> str:
    try:
        return version("forge-api")
    except PackageNotFoundError:
        return "0.1.0"


def migration_head() -> str | None:
    versions_dir = Path.cwd() / "alembic" / "versions"
    if not versions_dir.exists():
        return None

    revisions = sorted(
        path.name.split("_", maxsplit=2)[:2]
        for path in versions_dir.glob("*.py")
        if path.name != "__init__.py"
    )
    if not revisions:
        return None
    return "_".join(revisions[-1])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def readiness(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    return {"status": "ready"}


@router.get("/status")
async def production_status(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    started_at = perf_counter()
    current_revision: str | None = None
    database_status = "ok"

    try:
        await db.execute(text("SELECT 1"))
        revision_result = await db.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
        current_revision = revision_result.scalar_one_or_none()
    except Exception:
        database_status = "error"

    latency_ms = round((perf_counter() - started_at) * 1000, 2)
    head_revision = migration_head()
    migrations_status = "unknown"
    if current_revision and head_revision:
        migrations_status = "ok" if current_revision == head_revision else "drift"

    overall_status = "ok"
    if database_status != "ok" or migrations_status == "drift":
        overall_status = "degraded"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "app": settings.app_name,
        "checks": {
            "database": {
                "latency_ms": latency_ms,
                "status": database_status,
            },
            "migrations": {
                "current": current_revision,
                "head": head_revision,
                "status": migrations_status,
            },
        },
        "environment": settings.environment,
        "status": overall_status,
        "timestamp": datetime.now(UTC).isoformat(),
        "version": api_version(),
    }
