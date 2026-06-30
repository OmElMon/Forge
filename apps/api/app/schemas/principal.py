from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models.enums import UserRole


class Principal(BaseModel):
    user_id: UUID
    company_id: UUID
    email: EmailStr
    full_name: str
    company_name: str
    role: UserRole
