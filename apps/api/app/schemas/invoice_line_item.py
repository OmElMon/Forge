from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class InvoiceLineItemCreate(BaseModel):
    description: str = Field(min_length=2, max_length=240)
    quantity: int = Field(default=1, ge=1, le=10_000)
    unit_amount_cents: int = Field(default=0, ge=0, le=100_000_000)
    sort_order: int = Field(default=0, ge=0, le=10_000)


class InvoiceLineItemUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=2, max_length=240)
    quantity: int | None = Field(default=None, ge=1, le=10_000)
    unit_amount_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    sort_order: int | None = Field(default=None, ge=0, le=10_000)


class InvoiceLineItemRead(BaseModel):
    id: UUID
    invoice_id: UUID
    description: str
    quantity: int
    unit_amount_cents: int
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
