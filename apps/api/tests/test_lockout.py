from fastapi.testclient import TestClient
from pytest import MonkeyPatch

import app.main as main_module
from app.api.v1.endpoints import auth as auth_endpoint
from app.core.lockout import (
    LOGIN_LOCKOUT,
    MemoryLoginLockout,
    RedisLoginLockout,
    build_lockout,
)
from app.schemas.auth import TokenPair

LOCKOUT_MSG = auth_endpoint.LOCKOUT_DETAIL


def make_store(**overrides: object) -> MemoryLoginLockout:
    params = {
        "max_attempts": 3,
        "window_seconds": 60,
        "duration_seconds": 60,
    }
    params.update(overrides)
    return MemoryLoginLockout(**params)


def await_check(store, key: str, now: float) -> tuple[bool, float]:
    import asyncio

    return asyncio.run(store.check(key, now=now))


def await_failure(store, key: str, now: float) -> None:
    import asyncio

    asyncio.run(store.register_failure(key, now=now))


def test_memory_lockout_allows_up_to_limit_then_blocks() -> None:
    store = make_store()
    now = 1_000.0
    for offset in range(3):
        assert await_check(store, "acct", now + offset) == (False, 0.0)
        await_failure(store, "acct", now + offset)

    blocked, retry_after = await_check(store, "acct", now + 3)
    assert blocked is True
    assert 0 < retry_after <= 60


def test_memory_lockout_keys_are_isolated() -> None:
    store = make_store()
    now = 1_000.0
    await_failure(store, "email:a", now)
    await_failure(store, "email:a", now)
    await_failure(store, "email:a", now)
    assert await_check(store, "email:b", now) == (False, 0.0)


def test_memory_lockout_expires_after_duration() -> None:
    store = make_store()
    now = 1_000.0
    for offset in range(4):
        await_failure(store, "acct", now + offset)

    blocked, _ = await_check(store, "acct", now + 4)
    assert blocked is True
    # Past the block+window the account recovers.
    assert await_check(store, "acct", now + 4 + 61) == (False, 0.0)


def test_memory_lockout_reset_clears_failures() -> None:
    store = make_store()
    now = 1_000.0
    await_failure(store, "acct", now)
    await_failure(store, "acct", now + 1)

    import asyncio

    asyncio.run(store.reset("acct"))
    assert await_check(store, "acct", now + 2) == (False, 0.0)
    await_failure(store, "acct", now + 2)
    assert await_check(store, "acct", now + 3) == (False, 0.0)


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int] = {}
        self.raise_on_command = False

    def _expire(self, key: str, seconds: int | None) -> None:
        if seconds is None:
            self.ttls.pop(key, None)
        else:
            self.ttls[key] = seconds

    async def incr(self, key: str) -> int:
        self._raise()
        self._cleanup_expired()
        value = int(self.store.get(key, "0")) + 1
        self.store[key] = str(value)
        return value

    async def expire(self, key: str, seconds: int) -> bool:
        self._raise()
        self._expire(key, seconds)
        return True

    async def ttl(self, key: str) -> int:
        self._raise()
        self._cleanup_expired()
        if key not in self.store:
            return -2
        return self.ttls.get(key, -1)

    async def get(self, key: str) -> str | None:
        self._raise()
        self._cleanup_expired()
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._raise()
        self.store[key] = value
        self._expire(key, ex)

    async def delete(self, *keys: str) -> int:
        self._raise()
        removed = sum(1 for key in keys if key in self.store)
        for key in keys:
            self.store.pop(key, None)
            self.ttls.pop(key, None)
        return removed

    def _cleanup_expired(self) -> None:
        for key in list(self.store):
            if self.ttls.get(key, 0) == 0:
                self.store.pop(key, None)
                self.ttls.pop(key, None)

    def _raise(self) -> None:
        if self.raise_on_command:
            raise ConnectionError("redis down")


def test_redis_lockout_blocks_across_stores() -> None:
    shared = FakeRedis()
    first = RedisLoginLockout(max_attempts=3, window_seconds=60, duration_seconds=60, client=shared)
    second = RedisLoginLockout(
        max_attempts=3, window_seconds=60, duration_seconds=60, client=shared
    )
    now = 1_000.0
    for offset in range(3):
        assert await_check(first, "acct", now + offset) == (False, 0.0)
        await_failure(first, "acct", now + offset)

    blocked, retry_after = await_check(second, "acct", now + 3)
    assert blocked is True
    assert retry_after > 0
    assert "forge:lockout:locked:acct" in shared.store


def test_redis_lockout_fails_open_when_store_unavailable() -> None:
    shared = FakeRedis()
    shared.raise_on_command = True
    store = RedisLoginLockout(max_attempts=3, window_seconds=60, duration_seconds=60, client=shared)
    await_failure(store, "acct", 1_000.0)
    assert await_check(store, "acct", 1_000.0) == (False, 0.0)


def test_redis_lockout_fails_open_without_client() -> None:
    store = RedisLoginLockout(max_attempts=3, window_seconds=60, duration_seconds=60, client=None)
    assert await_check(store, "acct", 1_000.0) == (False, 0.0)


def test_build_lockout_selects_configured_backend(monkeypatch: MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "rate_limiter_backend", "memory")
    assert isinstance(build_lockout(), MemoryLoginLockout)

    monkeypatch.setattr(settings, "rate_limiter_backend", "redis")
    assert isinstance(build_lockout(), RedisLoginLockout)


async def failing_authenticate(db: object, payload: object) -> TokenPair:
    from fastapi import HTTPException, status

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
    )


async def succeeding_authenticate(db: object, payload: object) -> TokenPair:
    return TokenPair(access_token="aaa", refresh_token="bbb", expires_in=900)


def test_login_lockout_blocks_after_max_attempts(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(auth_endpoint, "authenticate", failing_authenticate)
    monkeypatch.setattr(auth_endpoint, "LOGIN_LOCKOUT", make_store())
    client = TestClient(main_module.app, raise_server_exceptions=False)
    payload = {"email": "victim@example.com", "password": "wrong"}

    for _ in range(3):
        response = client.post("/api/v1/auth/login", json=payload)
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid email or password"

    blocked = client.post("/api/v1/auth/login", json=payload)
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == LOCKOUT_MSG
    assert "Retry-After" in blocked.headers


def test_login_lockout_ip_key_blocks_other_accounts(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(auth_endpoint, "authenticate", failing_authenticate)
    monkeypatch.setattr(auth_endpoint, "LOGIN_LOCKOUT", make_store(max_attempts=2))
    client = TestClient(main_module.app, raise_server_exceptions=False)

    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "other@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "victim@example.com", "password": "wrong"}
        ).status_code
        == 401
    )

    third = client.post(
        "/api/v1/auth/login", json={"email": "other@example.com", "password": "wrong"}
    )
    assert third.status_code == 429  # the shared IP hit its own threshold first


def test_login_lockout_success_resets_failures(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(auth_endpoint, "LOGIN_LOCKOUT", make_store())
    client = TestClient(main_module.app, raise_server_exceptions=False)
    payload = {"email": "victim@example.com", "password": "wrong"}

    monkeypatch.setattr(auth_endpoint, "authenticate", failing_authenticate)
    assert client.post("/api/v1/auth/login", json=payload).status_code == 401
    assert client.post("/api/v1/auth/login", json=payload).status_code == 401

    monkeypatch.setattr(auth_endpoint, "authenticate", succeeding_authenticate)
    assert client.post("/api/v1/auth/login", json=payload).status_code == 200

    monkeypatch.setattr(auth_endpoint, "authenticate", failing_authenticate)
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 401


def test_lockout_ignored_when_disabled(monkeypatch: MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "account_lockout_enabled", False)
    monkeypatch.setattr(auth_endpoint, "authenticate", failing_authenticate)
    monkeypatch.setattr(auth_endpoint, "LOGIN_LOCKOUT", make_store())
    client = TestClient(main_module.app, raise_server_exceptions=False)

    payload = {"email": "victim@example.com", "password": "wrong"}
    for _ in range(6):
        response = client.post("/api/v1/auth/login", json=payload)
        assert response.status_code == 401


def test_lockout_singleton_is_configured() -> None:
    assert isinstance(LOGIN_LOCKOUT, (MemoryLoginLockout, RedisLoginLockout))
