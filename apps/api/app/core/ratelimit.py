import logging
import time

from fastapi import Request

logger = logging.getLogger("app.ratelimit")


class FixedWindowLimiter:
    """In-process fixed-window rate limiter keyed by client IP.

    A single-instance MVP keeps counters in memory. A multi-instance deployment
    should use ``RedisFixedWindowLimiter`` for a shared store behind the same
    ``allow`` contract.
    """

    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._pruned_at = 0.0

    async def allow(self, key: str, now: float | None = None) -> tuple[bool, float]:
        """Record a hit and report whether it stays within the limit.

        Returns ``(allowed, retry_after_seconds)`` where ``allowed`` is False and
        ``retry_after_seconds`` is positive when the key is over the limit.
        """
        current = now if now is not None else time.monotonic()
        self._prune_unless_recent(current)
        cutoff = current - self.window_seconds
        hits = [stamp for stamp in self._hits.get(key, []) if stamp > cutoff]
        hits.append(current)
        self._hits[key] = hits
        if len(hits) <= self.limit:
            return True, 0.0
        retry_after = max(1, int(self.window_seconds - (current - hits[0])))
        return False, float(retry_after)

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

    def _prune_unless_recent(self, now: float) -> None:
        if now - self._pruned_at < self.window_seconds:
            return
        self._pruned_at = now
        cutoff = now - self.window_seconds
        stale = [key for key, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
        for key in stale:
            del self._hits[key]


class RedisFixedWindowLimiter:
    """Shared fixed-window rate limiter backed by a Redis-style client.

    Every ``allow`` call is a single atomic INCR against a window-slot key plus an
    EXPIRE when the counter is born, so multiple API processes enforce one limit.
    If the shared store is unavailable the limiter fails open (allow) rather than
    taking the API down; availability wins over throttling.
    """

    def __init__(
        self,
        limit: int,
        window_seconds: int = 60,
        client: object | None = None,
        key_prefix: str = "forge:ratelimit",
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._client = client
        self._key_prefix = key_prefix

    async def allow(self, key: str, now: float | None = None) -> tuple[bool, float]:
        current = now if now is not None else time.time()
        slot = int(current // self.window_seconds)
        store_key = f"{self._key_prefix}:{slot}:{key}"
        if self._client is None:
            return True, 0.0
        try:
            count = await self._client.incr(store_key)
            if count == 1:
                await self._client.expire(store_key, self.window_seconds)
        except Exception:
            logger.warning("rate limiter Redis call failed; failing open", exc_info=True)
            return True, 0.0
        if count <= self.limit:
            return True, 0.0
        retry_after = max(1, int(self.window_seconds - (current % self.window_seconds)))
        return False, float(retry_after)


def build_limiter(limit: int) -> FixedWindowLimiter | RedisFixedWindowLimiter:
    """Construct the configured rate limiter for an API process."""
    from app.core.config import settings

    if settings.rate_limiter_backend == "redis":
        return RedisFixedWindowLimiter(limit, client=_redis_client())
    return FixedWindowLimiter(limit)


def _redis_client() -> object | None:
    try:
        from redis.asyncio import from_url as redis_from_url
    except Exception:  # pragma: no cover - redis is a hard dependency via celery[redis]
        return None
    from app.core.config import settings

    return redis_from_url(settings.redis_url, decode_responses=True)


def rate_limit_key(request: Request) -> str:
    """Best-effort client identity: first X-Forwarded-For value, then peer IP."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client is not None and request.client.host:
        return request.client.host
    return "unknown"
