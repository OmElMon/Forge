from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import IntakeRecordKind, IntakeRecordStatus


class IntakeRecordCreate(BaseModel):
    kind: IntakeRecordKind = IntakeRecordKind.LEAD
    status: IntakeRecordStatus = IntakeRecordStatus.NEW
    name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    source: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)


class IntakeRecordUpdate(BaseModel):
    status: IntakeRecordStatus | None = None
    name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    source: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)


class IntakeRecordRead(BaseModel):
    id: UUID
    company_id: UUID
    kind: IntakeRecordKind
    status: IntakeRecordStatus
    name: str | None
    phone: str | None
    source: str | None
    notes: str | None
    customer_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
