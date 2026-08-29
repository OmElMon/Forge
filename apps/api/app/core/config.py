from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "CrewPilot OS API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://forge:forge@localhost:5432/forge"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = Field(
        default="development-only-change-this-secret-key",
        min_length=32,
    )
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    password_reset_token_expire_minutes: int = 30
    invite_expire_days: int = 7
    public_base_url: str = "http://localhost:3000"
    cors_origins: list[str] = ["http://localhost:3000"]

    messaging_provider: str = "disabled"
    voice_provider: str = "disabled"
    payments_provider: str = "disabled"
    accounting_provider: str = "disabled"

    rate_limiting_enabled: bool = True
    rate_limiter_backend: Literal["memory", "redis"] = "memory"
    rate_limit_auth_per_minute: int = 30
    rate_limit_api_per_minute: int = 200

    account_lockout_enabled: bool = True
    account_lockout_max_attempts: int = 5
    account_lockout_window_seconds: int = 900
    account_lockout_duration_seconds: int = 900


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
