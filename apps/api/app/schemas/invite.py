from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class InviteCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    role: UserRole


class InviteRead(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: UserRole
    status: str
    invited_by: str | None
    expires_at: datetime
    created_at: datetime
    accept_link: str | None = None


class InvitePreview(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole
    company_name: str


class InviteAcceptRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=12, max_length=128)
