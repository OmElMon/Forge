from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import InvoiceStatus, InvoiceType


class InvoiceCreate(BaseModel):
    customer_id: UUID
    document_type: InvoiceType = InvoiceType.ESTIMATE
    status: InvoiceStatus = InvoiceStatus.DRAFT
    title: str = Field(min_length=2, max_length=160)
    amount_cents: int = Field(ge=0, le=100_000_000)
    due_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=4000)


class InvoiceUpdate(BaseModel):
    customer_id: UUID | None = None
    document_type: InvoiceType | None = None
    status: InvoiceStatus | None = None
    title: str | None = Field(default=None, min_length=2, max_length=160)
    amount_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    due_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=4000)


class InvoiceRead(BaseModel):
    id: UUID
    company_id: UUID
    customer_id: UUID
    document_type: InvoiceType
    status: InvoiceStatus
    title: str
    amount_cents: int
    due_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
