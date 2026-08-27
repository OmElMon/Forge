from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ServiceAddressCreate(BaseModel):
    label: str = Field(default="Home", min_length=1, max_length=40)
    address_line1: str = Field(min_length=2, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    city: str = Field(min_length=2, max_length=120)
    state: str = Field(min_length=2, max_length=2)
    postal_code: str = Field(min_length=3, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)


class ServiceAddressUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=40)
    address_line1: str | None = Field(default=None, min_length=2, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, min_length=2, max_length=120)
    state: str | None = Field(default=None, min_length=2, max_length=2)
    postal_code: str | None = Field(default=None, min_length=3, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)


class ServiceAddressRead(BaseModel):
    id: UUID
    company_id: UUID
    customer_id: UUID
    label: str
    address_line1: str
    address_line2: str | None
    city: str
    state: str
    postal_code: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
