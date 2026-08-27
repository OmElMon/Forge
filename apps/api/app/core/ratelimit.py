import time

from fastapi import Request


class FixedWindowLimiter:
    """In-process sliding-window rate limiter keyed by client IP.

    A single-instance MVP keeps counters in memory. A multi-instance deployment
    should swap the counters for a shared store (e.g. Redis) behind the same
    ``allow`` contract.
    """

    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._pruned_at = 0.0

    def allow(self, key: str, now: float | None = None) -> tuple[bool, float]:
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


def rate_limit_key(request: Request) -> str:
    """Best-effort client identity: first X-Forwarded-For value, then peer IP."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client is not None and request.client.host:
        return request.client.host
    return "unknown"
