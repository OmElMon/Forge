from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import CustomerStatus


class CustomerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    status: CustomerStatus = CustomerStatus.LEAD
    source: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    status: CustomerStatus | None = None
    source: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)


class CustomerRead(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    phone: str | None
    email: EmailStr | None
    status: CustomerStatus
    source: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
