from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class EquipmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    manufacturer: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=120)
    installed_at: date | None = None
    notes: str | None = Field(default=None, max_length=4000)


class EquipmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    manufacturer: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=120)
    installed_at: date | None = None
    notes: str | None = Field(default=None, max_length=4000)


class EquipmentRead(BaseModel):
    id: UUID
    company_id: UUID
    customer_id: UUID
    name: str
    manufacturer: str | None
    model: str | None
    serial_number: str | None
    installed_at: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
