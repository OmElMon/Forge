import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.ratelimit import FixedWindowLimiter, rate_limit_key

logger = logging.getLogger("app.request")

REQUEST_ID_HEADER = "x-request-id"
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

AUTH_RATE_LIMITER = FixedWindowLimiter(settings.rate_limit_auth_per_minute)
API_RATE_LIMITER = FixedWindowLimiter(settings.rate_limit_api_per_minute)

SYSTEM_PREFIXES = (
    f"{settings.api_v1_prefix}/health",
    f"{settings.api_v1_prefix}/ready",
    f"{settings.api_v1_prefix}/status",
    f"{settings.api_v1_prefix}/openapi.json",
    "/docs",
    "/redoc",
)
AUTH_PREFIX = f"{settings.api_v1_prefix}/auth/"


def is_system_path(path: str) -> bool:
    return path == "/" or any(path.startswith(prefix) for prefix in SYSTEM_PREFIXES)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if not settings.rate_limiting_enabled:
        return await call_next(request)
    path = request.url.path
    if is_system_path(path):
        return await call_next(request)
    limiter = AUTH_RATE_LIMITER if path.startswith(AUTH_PREFIX) else API_RATE_LIMITER
    allowed, retry_after = limiter.allow(rate_limit_key(request))
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"error": "Too many requests."},
            headers={"Retry-After": str(int(retry_after))},
        )
    return await call_next(request)


@app.middleware("http")
async def request_log_middleware(request: Request, call_next):
    request_id = request.headers.get(REQUEST_ID_HEADER) or uuid4().hex
    token = request_id_var.set(request_id)
    started_at = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "request failed request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        raise
    finally:
        request_id_var.reset(token)
    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    response.headers[REQUEST_ID_HEADER] = request_id
    logger.info(
        "request completed request_id=%s method=%s path=%s status=%d duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs"}
