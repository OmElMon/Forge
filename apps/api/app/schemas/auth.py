from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class SignUpRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=160)
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=12, max_length=128)


class EmailVerifyRequest(BaseModel):
    email: EmailStr


class EmailVerifyConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class ResetCodeDelivery(BaseModel):
    status: str
    channel: str
    code_valid_seconds: int
    dev_code: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class MfaChallenge(BaseModel):
    mfa_required: Literal[True] = True
    mfa_session: str


class LoginResponse(BaseModel):
    """Response for /auth/login: either MFA is required (challenge token) or the
    user is fully authenticated (token pair)."""

    mfa_required: bool = False
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
    mfa_session: str | None = None


class MfaEnrollResult(BaseModel):
    secret: str
    provisioning_uri: str
    recovery_codes: list[str]


class MfaConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class MfaDisableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=64)


class MfaChallengeVerifyRequest(BaseModel):
    mfa_session: str
    code: str = Field(min_length=6, max_length=64)
