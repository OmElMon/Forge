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
