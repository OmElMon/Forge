from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import JobStatus


class JobCreate(BaseModel):
    customer_id: UUID
    technician_id: UUID | None = None
    title: str = Field(min_length=2, max_length=160)
    status: JobStatus = JobStatus.NEW
    scheduled_start: datetime | None = None
    technician_name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=4000)


class JobUpdate(BaseModel):
    customer_id: UUID | None = None
    technician_id: UUID | None = None
    title: str | None = Field(default=None, min_length=2, max_length=160)
    status: JobStatus | None = None
    scheduled_start: datetime | None = None
    technician_name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=4000)


class JobRead(BaseModel):
    id: UUID
    company_id: UUID
    customer_id: UUID
    technician_id: UUID | None
    title: str
    status: JobStatus
    scheduled_start: datetime | None
    technician_name: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
