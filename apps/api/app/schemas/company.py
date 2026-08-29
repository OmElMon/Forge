from datetime import datetime
from re import fullmatch
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import CompanyStatus

_TIMEZONE_PATTERN = r"[A-Za-z0-9_+./-]+"


class CompanyRead(BaseModel):
    id: UUID
    name: str
    slug: str
    timezone: str
    service_area: str | None
    default_trade: str | None
    notification_prefs: dict[str, bool]
    status: CompanyStatus
    billing_status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    timezone: str | None = Field(default=None, max_length=64)
    service_area: str | None = Field(default=None, max_length=160)
    default_trade: str | None = Field(default=None, max_length=80)
    notification_prefs: dict[str, bool] | None = None

    @field_validator("name", "service_area", "default_trade")
    @classmethod
    def _strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped or not fullmatch(_TIMEZONE_PATTERN, stripped):
            raise ValueError("Provide a valid IANA timezone such as America/New_York.")
        return stripped


class CompanyStatusUpdate(BaseModel):
    status: CompanyStatus
