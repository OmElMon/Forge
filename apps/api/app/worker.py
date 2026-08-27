from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery = Celery("forge", broker=settings.redis_url, backend=settings.redis_url)
celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)
celery.conf.beat_schedule = {
    "automation-followup-sweep": {
        "task": "automation.followup_sweep",
        "schedule": crontab(minute="*/15"),
        "options": {"expires": 60 * 15},
    },
}

# Import task modules so @celery.task registrations are visible to the worker.
import app.worker_tasks  # noqa: E402, F401
