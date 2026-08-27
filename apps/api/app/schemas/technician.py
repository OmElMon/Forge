from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import TechnicianStatus


class TechnicianCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    status: TechnicianStatus = TechnicianStatus.AVAILABLE
    skills: list[str] = Field(default_factory=list, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)


class TechnicianUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    status: TechnicianStatus | None = None
    skills: list[str] | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)


class TechnicianRead(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    phone: str | None
    email: EmailStr | None
    status: TechnicianStatus
    skills: list[str]
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TechnicianWorkload(BaseModel):
    technician_id: UUID
    technician_name: str
    status: TechnicianStatus
    open_job_count: int = 0
    in_progress_job_count: int = 0
    scheduled_job_count: int = 0
    next_scheduled_start: datetime | None = None
    current_job_title: str | None = None
    computed_at: datetime | None = None
