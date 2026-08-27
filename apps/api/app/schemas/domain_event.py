from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class DomainEventRead(BaseModel):
    id: UUID
    company_id: UUID
    event_type: str
    aggregate_type: str
    aggregate_id: UUID
    actor_user_id: UUID | None
    occurred_at: datetime
    source: str
    correlation_id: UUID | None
    payload: dict[str, Any]

    model_config = {"from_attributes": True}
