from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models.enums import UserRole


class MembershipRead(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: UserRole
    joined_at: datetime
