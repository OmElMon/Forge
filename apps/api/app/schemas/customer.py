from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import CustomerStatus, PreferredContact
from app.schemas.equipment import EquipmentRead
from app.schemas.service_address import ServiceAddressRead


class CustomerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    status: CustomerStatus = CustomerStatus.LEAD
    source: str | None = Field(default=None, max_length=80)
    preferred_contact: PreferredContact | None = None
    sms_opt_in: bool = False
    notes: str | None = Field(default=None, max_length=4000)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    status: CustomerStatus | None = None
    source: str | None = Field(default=None, max_length=80)
    preferred_contact: PreferredContact | None = None
    sms_opt_in: bool | None = None
    notes: str | None = Field(default=None, max_length=4000)


class CustomerRead(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    phone: str | None
    email: EmailStr | None
    status: CustomerStatus
    source: str | None
    preferred_contact: PreferredContact | None
    sms_opt_in: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerDetail(CustomerRead):
    lifetime_value_cents: int
    paid_invoice_count: int
    open_job_count: int
    open_estimate_count: int
    open_estimate_cents: int
    open_invoice_count: int
    open_invoice_cents: int
    service_addresses: list[ServiceAddressRead]
    equipment: list[EquipmentRead]
