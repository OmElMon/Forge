from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

AttentionCategory = Literal[
    "estimate_follow_up",
    "invoice_collection",
    "job_scheduling",
    "job_assignment",
    "job_invoicing",
]
AttentionPriority = Literal["urgent", "high", "medium"]


class AttentionItem(BaseModel):
    category: AttentionCategory
    priority: AttentionPriority
    title: str
    description: str
    action_label: str
    action_href: str
    source_type: Literal["invoice", "job"]
    source_id: UUID
    customer_id: UUID
    customer_name: str
    amount_cents: int
    due_at: datetime | None = None
    created_at: datetime


class AttentionSummary(BaseModel):
    revenue_at_risk_cents: int
    open_estimate_cents: int
    open_invoice_cents: int
    overdue_invoice_count: int
    unscheduled_job_count: int
    unassigned_job_count: int
    completed_uninvoiced_job_count: int
    items: list[AttentionItem]
