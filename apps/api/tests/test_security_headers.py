from fastapi.testclient import TestClient
from pytest import MonkeyPatch

import app.main as main_module


def assert_security_headers(response) -> None:
    headers = response.headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert headers["permissions-policy"]
    assert headers["cross-origin-opener-policy"] == "same-origin"
    assert headers["strict-transport-security"]


def test_successful_response_carries_security_headers() -> None:
    client = TestClient(main_module.app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert_security_headers(response)


def test_error_response_carries_security_headers() -> None:
    client = TestClient(main_module.app)
    response = client.get("/api/v1/customers")
    assert response.status_code == 401
    assert_security_headers(response)


def test_rate_limited_response_carries_security_headers(monkeypatch: MonkeyPatch) -> None:
    from app.core.ratelimit import FixedWindowLimiter

    monkeypatch.setattr(
        main_module,
        "API_RATE_LIMITER",
        FixedWindowLimiter(limit=1, window_seconds=60),
    )
    client = TestClient(main_module.app)

    first = client.get("/api/v1/customers")
    assert first.status_code != 429
    assert_security_headers(first)

    second = client.get("/api/v1/customers")
    assert second.status_code == 429
    assert_security_headers(second)


def test_openapi_and_root_are_protected_too() -> None:
    client = TestClient(main_module.app)
    assert_security_headers(client.get("/api/v1/openapi.json"))
    assert_security_headers(client.get("/"))
