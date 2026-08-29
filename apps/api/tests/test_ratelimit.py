from fastapi.testclient import TestClient
from pytest import MonkeyPatch

import app.main as main_module
from app.core.ratelimit import (
    FixedWindowLimiter,
    RedisFixedWindowLimiter,
    build_limiter,
    rate_limit_key,
)


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

    assert await_allow(limiter, "client-a", now) == (True, 0.0)
    assert await_allow(limiter, "client-a", now) == (True, 0.0)
    allowed, retry_after = await_allow(limiter, "client-a", now)
    assert allowed is False
    assert retry_after > 0

    # Other clients are unaffected.
    assert await_allow(limiter, "client-b", now) == (True, 0.0)


def test_limiter_window_resets_and_counters_are_isolated() -> None:
    limiter = FixedWindowLimiter(limit=1, window_seconds=60)
    now = 1_000.0

    assert await_allow(limiter, "client-a", now) == (True, 0.0)
    assert await_allow(limiter, "client-a", now) == (False, 60)
    assert await_allow(limiter, "client-b", now) == (True, 0.0)

    # Past the window the client recovers.
    assert await_allow(limiter, "client-a", now + 61) == (True, 0.0)


def test_limiter_reset_drops_client_state() -> None:
    limiter = FixedWindowLimiter(limit=1, window_seconds=60)
    now = 1_000.0

    assert await_allow(limiter, "client-a", now) == (True, 0.0)
    assert await_allow(limiter, "client-a", now) == (False, 60)
    limiter.reset("client-a")
    assert await_allow(limiter, "client-a", now) == (True, 0.0)


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


def await_allow(limiter, key: str, now: float) -> tuple[bool, float]:
    import asyncio

    return asyncio.run(limiter.allow(key, now=now))


class FakeRedis:
    """Minimal async Redis stand-in recording INCR/EXPIRE behavior."""

    def __init__(self) -> None:
        self.store: dict[str, int] = {}
        self.ttls: dict[str, int | None] = {}
        self.raise_on_command = False

    async def incr(self, key: str) -> int:
        if self.raise_on_command:
            raise ConnectionError("redis down")
        count = self.store.get(key, 0) + 1
        self.store[key] = count
        return count

    async def expire(self, key: str, seconds: int) -> bool:
        if self.raise_on_command:
            raise ConnectionError("redis down")
        self.ttls[key] = seconds
        return True


def test_redis_limiter_enforces_limit_across_instances() -> None:
    store = FakeRedis()
    first = RedisFixedWindowLimiter(limit=3, window_seconds=60, client=store)
    second = RedisFixedWindowLimiter(limit=3, window_seconds=60, client=store)
    now = 1_000.0

    assert await_allow(first, "client-a", now) == (True, 0.0)
    assert await_allow(first, "client-a", now) == (True, 0.0)
    assert await_allow(second, "client-a", now) == (True, 0.0)
    allowed, retry_after = await_allow(second, "client-a", now)
    assert allowed is False
    assert retry_after > 0
    assert store.ttls  # the window key expiry was set

    # Other clients are unaffected.
    assert await_allow(first, "client-b", now) == (True, 0.0)


def test_redis_limiter_window_advances_by_slot() -> None:
    store = FakeRedis()
    limiter = RedisFixedWindowLimiter(limit=1, window_seconds=60, client=store)

    assert await_allow(limiter, "client-a", 1_000.0) == (True, 0.0)
    allowed, retry_after = await_allow(limiter, "client-a", 1_000.0)
    assert allowed is False
    assert retry_after == 20  # fixed-window boundary at 1020.0

    # The next window slot resets the counter.
    assert await_allow(limiter, "client-a", 1_020.0) == (True, 0.0)


def test_redis_limiter_fails_open_when_store_unavailable() -> None:
    store = FakeRedis()
    store.raise_on_command = True
    limiter = RedisFixedWindowLimiter(limit=1, window_seconds=60, client=store)

    assert await_allow(limiter, "client-a", 1_000.0) == (True, 0.0)


def test_redis_limiter_fails_open_without_client() -> None:
    limiter = RedisFixedWindowLimiter(limit=1, window_seconds=60, client=None)

    assert await_allow(limiter, "client-a", 1_000.0) == (True, 0.0)


def test_build_limiter_selects_configured_backend(monkeypatch: MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "rate_limiter_backend", "memory")
    assert isinstance(build_limiter(10), FixedWindowLimiter)

    monkeypatch.setattr(settings, "rate_limiter_backend", "redis")
    assert isinstance(build_limiter(10), RedisFixedWindowLimiter)
