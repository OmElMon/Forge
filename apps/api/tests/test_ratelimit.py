from fastapi.testclient import TestClient
from pytest import MonkeyPatch

import app.main as main_module
from app.core.ratelimit import FixedWindowLimiter, rate_limit_key


class FakeScopeRequest:
    def __init__(self, host: str, forwarded: str | None = None) -> None:
        self.headers = {"x-forwarded-for": forwarded} if forwarded else {}
        self.client = type("Client", (), {"host": host})()


def test_rate_limit_key_prefers_forwarded_header() -> None:
    request = FakeScopeRequest(host="10.0.0.5", forwarded="203.0.113.7, 10.0.0.1")
    assert rate_limit_key(request) == "203.0.113.7"


def test_rate_limit_key_falls_back_to_peer_ip() -> None:
    request = FakeScopeRequest(host="10.0.0.5")
    assert rate_limit_key(request) == "10.0.0.5"


def test_rate_limit_key_returns_unknown_without_client() -> None:
    request = FakeScopeRequest(host="10.0.0.5")
    request.client = None
    assert rate_limit_key(request) == "unknown"


def test_limiter_allows_up_to_limit_and_then_rejects() -> None:
    limiter = FixedWindowLimiter(limit=2, window_seconds=60)
    now = 1_000.0

    assert limiter.allow("client-a", now=now) == (True, 0.0)
    assert limiter.allow("client-a", now=now) == (True, 0.0)
    allowed, retry_after = limiter.allow("client-a", now=now)
    assert allowed is False
    assert retry_after > 0

    # Other clients are unaffected.
    assert limiter.allow("client-b", now=now) == (True, 0.0)


def test_limiter_window_resets_and_counters_are_isolated() -> None:
    limiter = FixedWindowLimiter(limit=1, window_seconds=60)
    now = 1_000.0

    assert limiter.allow("client-a", now=now) == (True, 0.0)
    assert limiter.allow("client-a", now=now) == (False, 60)
    assert limiter.allow("client-b", now=now) == (True, 0.0)

    # Past the window the client recovers.
    assert limiter.allow("client-a", now=now + 61) == (True, 0.0)


def test_limiter_reset_drops_client_state() -> None:
    limiter = FixedWindowLimiter(limit=1, window_seconds=60)
    now = 1_000.0

    assert limiter.allow("client-a", now=now) == (True, 0.0)
    assert limiter.allow("client-a", now=now) == (False, 60)
    limiter.reset("client-a")
    assert limiter.allow("client-a", now=now) == (True, 0.0)


def test_api_rate_limit_returns_429_with_retry_after(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(
        main_module,
        "API_RATE_LIMITER",
        FixedWindowLimiter(limit=3, window_seconds=60),
    )
    client = TestClient(main_module.app)

    for _ in range(3):
        response = client.get("/api/v1/customers")
        assert response.status_code != 429  # counted by the limiter regardless of route outcome

    response = client.get("/api/v1/customers")
    assert response.status_code == 429
    assert response.json() == {"error": "Too many requests."}
    assert "Retry-After" in response.headers


def test_auth_rate_limit_applies_to_login(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(
        main_module,
        "AUTH_RATE_LIMITER",
        FixedWindowLimiter(limit=3, window_seconds=60),
    )
    client = TestClient(main_module.app, raise_server_exceptions=False)

    payload = {"email": "a@example.com", "password": "wrong"}
    for _ in range(3):
        response = client.post("/api/v1/auth/login", json=payload)
        assert response.status_code != 429

    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 429


def test_system_endpoints_are_exempt_from_limiting(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(
        main_module,
        "API_RATE_LIMITER",
        FixedWindowLimiter(limit=1, window_seconds=60),
    )
    client = TestClient(main_module.app)

    first = client.get("/api/v1/health")
    second = client.get("/api/v1/health")
    assert first.status_code == 200
    assert second.status_code == 200
