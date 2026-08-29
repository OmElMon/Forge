import logging
import time

logger = logging.getLogger("app.lockout")


class MemoryLoginLockout:
    """In-process login lockout keyed by account email and client identity.

    Failed logins are recorded per key within a sliding window; once a key
    exceeds ``max_attempts`` it is blocked for ``duration_seconds``. A single
    instance keeps the state in memory; multi-instance deployments should use
    ``RedisLoginLockout`` behind the same ``check``/``register_failure``/
    ``reset`` contract.
    """

    def __init__(
        self,
        *,
        max_attempts: int,
        window_seconds: int,
        duration_seconds: int,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.duration_seconds = duration_seconds
        self._failures: dict[str, list[float]] = {}
        self._locked_until: dict[str, float] = {}
        self._pruned_at = 0.0

    async def check(self, key: str, now: float | None = None) -> tuple[bool, float]:
        """Report whether ``key`` is blocked and for how long.

        Returns ``(blocked, retry_after_seconds)``.
        """
        current = now if now is not None else time.monotonic()
        self._prune_unless_recent(current)
        locked_until = self._locked_until.get(key, 0.0)
        if locked_until > current:
            return True, locked_until - current
        cutoff = current - self.window_seconds
        records = [stamp for stamp in self._failures.get(key, []) if stamp > cutoff]
        if len(records) >= self.max_attempts:
            until = records[-1] + self.duration_seconds
            if until > current:
                self._locked_until[key] = until
                return True, until - current
        return False, 0.0

    async def register_failure(self, key: str, now: float | None = None) -> None:
        current = now if now is not None else time.monotonic()
        cutoff = current - self.window_seconds
        records = [stamp for stamp in self._failures.get(key, []) if stamp > cutoff]
        records.append(current)
        self._failures[key] = records

    async def reset(self, key: str) -> None:
        self._failures.pop(key, None)
        self._locked_until.pop(key, None)

    def _prune_unless_recent(self, now: float) -> None:
        if now - self._pruned_at < self.window_seconds:
            return
        self._pruned_at = now
        cutoff = now - self.window_seconds
        for key in list(self._failures):
            records = [stamp for stamp in self._failures[key] if stamp > cutoff]
            if records:
                self._failures[key] = records
            else:
                del self._failures[key]
        for key in [k for k, until in self._locked_until.items() if until <= now]:
            del self._locked_until[key]


class RedisLoginLockout:
    """Shared login lockout backed by a Redis-style client.

    Failure counts live in per-window counters with an EXPIRE, and a blocked key
    sets a ``locked`` marker with a TTL covering the ban duration, so multiple
    API processes enforce one lockout. If the shared store is unavailable the
    lockout fails open (allow) so availability wins over brute-force hardening.
    """

    def __init__(
        self,
        *,
        max_attempts: int,
        window_seconds: int,
        duration_seconds: int,
        client: object | None = None,
        key_prefix: str = "forge:lockout",
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.duration_seconds = duration_seconds
        self._client = client
        self._key_prefix = key_prefix

    def _count_key(self, key: str, slot: int) -> str:
        return f"{self._key_prefix}:{slot}:{key}"

    def _locked_key(self, key: str) -> str:
        return f"{self._key_prefix}:locked:{key}"

    def _slot(self, now: float) -> int:
        return int(now // self.window_seconds)

    async def check(self, key: str, now: float | None = None) -> tuple[bool, float]:
        current = now if now is not None else time.time()
        if self._client is None:
            return False, 0.0
        try:
            ttl = await self._client.ttl(self._locked_key(key))
            if ttl and ttl > 0:
                return True, float(ttl)
            count = await self._client.get(self._count_key(key, self._slot(current)))
        except Exception:
            logger.warning("lockout Redis check failed; failing open", exc_info=True)
            return False, 0.0
        try:
            count = int(count or 0)
        except (TypeError, ValueError):
            count = 0
        if count >= self.max_attempts:
            await self._mark_locked(key, self.duration_seconds)
            return True, float(self.duration_seconds)
        return False, 0.0

    async def register_failure(self, key: str, now: float | None = None) -> None:
        current = now if now is not None else time.time()
        if self._client is None:
            return
        store_key = self._count_key(key, self._slot(current))
        try:
            count = await self._client.incr(store_key)
            if count == 1:
                await self._client.expire(store_key, self.window_seconds)
            if count >= self.max_attempts:
                await self._mark_locked(key, self.duration_seconds)
        except Exception:
            logger.warning("lockout Redis write failed; failing open", exc_info=True)

    async def reset(self, key: str) -> None:
        if self._client is None:
            return
        try:
            await self._client.delete(
                self._count_key(key, self._slot(time.time())),
                self._locked_key(key),
            )
        except Exception:
            logger.warning("lockout Redis reset failed", exc_info=True)

    async def _mark_locked(self, key: str, duration_seconds: int) -> None:
        try:
            await self._client.set(self._locked_key(key), "1", ex=duration_seconds)
        except Exception:
            logger.warning("lockout Redis lock-set failed", exc_info=True)


def build_lockout() -> MemoryLoginLockout | RedisLoginLockout:
    """Construct the login lockout for an API process.

    Shared-state backend follows ``settings.rate_limiter_backend`` so one
    deployment switch flips both the rate limiter and the lockout to Redis.
    """
    from app.core.config import settings

    kwargs = {
        "max_attempts": settings.account_lockout_max_attempts,
        "window_seconds": settings.account_lockout_window_seconds,
        "duration_seconds": settings.account_lockout_duration_seconds,
    }
    if settings.rate_limiter_backend == "redis":
        return RedisLoginLockout(client=_redis_client(), **kwargs)
    return MemoryLoginLockout(**kwargs)


def _redis_client() -> object | None:
    try:
        from redis.asyncio import from_url as redis_from_url
    except Exception:  # pragma: no cover - redis is a hard dependency via celery[redis]
        return None
    from app.core.config import settings

    return redis_from_url(settings.redis_url, decode_responses=True)


LOGIN_LOCKOUT = build_lockout()
