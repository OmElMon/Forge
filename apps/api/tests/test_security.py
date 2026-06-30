from datetime import timedelta
from uuid import uuid4

from app.core.security import create_token, decode_token, hash_password, verify_password


def test_password_round_trip() -> None:
    encoded = hash_password("a-very-strong-password")
    assert encoded != "a-very-strong-password"
    assert verify_password("a-very-strong-password", encoded)
    assert not verify_password("wrong-password", encoded)


def test_access_token_contains_tenant_boundary() -> None:
    user_id = uuid4()
    company_id = uuid4()
    token, _, _ = create_token(
        subject=user_id,
        company_id=company_id,
        token_type="access",
        expires_delta=timedelta(minutes=5),
    )
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["company_id"] == str(company_id)
    assert payload["type"] == "access"
