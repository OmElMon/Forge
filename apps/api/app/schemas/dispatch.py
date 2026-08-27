from uuid import UUID

from pydantic import BaseModel

from app.models.enums import TechnicianStatus


class DispatchSuggestion(BaseModel):
    technician_id: UUID
    technician_name: str
    status: TechnicianStatus
    confidence: float
    skill_match: list[str]
    skill_missing: list[str]
    load_conflicts: int
    reasons: list[str]
