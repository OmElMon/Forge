from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import FollowupTaskStatus


class FollowupTaskRead(BaseModel):
    id: UUID
    company_id: UUID
    customer_id: UUID | None
    job_id: UUID | None
    invoice_id: UUID | None
    rule_type: str
    title: str
    notes: str | None
    status: FollowupTaskStatus
    due_at: datetime | None
    delivered_at: datetime | None
    resolved_at: datetime | None
    resolved_by_user_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
