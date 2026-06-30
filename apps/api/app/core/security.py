from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

ALGORITHM = "HS256"
password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)


def create_token(
    *, subject: UUID, company_id: UUID, token_type: str, expires_delta: timedelta
) -> tuple[str, UUID, datetime]:
    now = datetime.now(UTC)
    expires_at = now + expires_delta
    token_id = uuid4()
    payload: dict[str, Any] = {
        "sub": str(subject),
        "company_id": str(company_id),
        "type": token_type,
        "jti": str(token_id),
        "iat": now,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM), token_id, expires_at


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])


def fingerprint_token(token: str) -> str:
    return sha256(token.encode()).hexdigest()
