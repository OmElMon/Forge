import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, DisconnectionError, InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.ratelimit import build_limiter, rate_limit_key

logger = logging.getLogger("app.request")

REQUEST_ID_HEADER = "x-request-id"
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

AUTH_RATE_LIMITER = build_limiter(settings.rate_limit_auth_per_minute)
API_RATE_LIMITER = build_limiter(settings.rate_limit_api_per_minute)

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


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if not settings.rate_limiting_enabled:
        return await call_next(request)
    path = request.url.path
    if is_system_path(path):
        return await call_next(request)
    limiter = AUTH_RATE_LIMITER if path.startswith(AUTH_PREFIX) else API_RATE_LIMITER
    allowed, retry_after = await limiter.allow(rate_limit_key(request))
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


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs"}


# --- Database availability -------------------------------------------------
#
# Only connection-level database failures are reported as a temporary outage.
# Everything else stays a 500 on purpose: an IntegrityError, DataError,
# ProgrammingError, or constraint violation is an application defect, and telling
# a client "try again in a moment" would invite pointless retries of something
# that will fail identically.
#
# `ConnectionRefusedError` is listed deliberately rather than its `ConnectionError`
# parent: SQLAlchemy's asyncpg dialect lets the connect-time OSError escape
# unwrapped, and in this API the only request-path socket to another service is
# Postgres (Redis-backed rate limiting fails open, provider adapters are disabled
# no-ops). Catching the broad `ConnectionError` would mislabel unrelated socket
# failures as database downtime.
DATABASE_CONNECTION_ERRORS: tuple[type[Exception], ...] = (
    OperationalError,  # connect failures, pooler shutdown, server-side disconnects
    InterfaceError,  # driver-level connection interface failures
    DisconnectionError,  # connection invalidated underneath an open transaction
    SQLAlchemyTimeoutError,  # pool checkout timeout
    ConnectionRefusedError,  # asyncpg connect-time refusal (paused/unreachable database)
)

DATABASE_UNAVAILABLE_DETAIL = (
    "The operations database is temporarily unavailable. Try again in a moment."
)

DATABASE_UNAVAILABLE_RETRY_AFTER_SECONDS = 5


def database_unavailable_response(request: Request, exc: Exception) -> JSONResponse:
    # Log the exception class only. Driver messages can contain host, port, user,
    # and SQL text, so none of the original error is echoed to the client.
    logger.warning(
        "database unavailable request_id=%s method=%s path=%s error=%s",
        request_id_var.get(),
        request.method,
        request.url.path,
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=503,
        content={"detail": DATABASE_UNAVAILABLE_DETAIL},
        headers={"Retry-After": str(DATABASE_UNAVAILABLE_RETRY_AFTER_SECONDS)},
    )


async def database_connection_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return database_unavailable_response(request, exc)


@app.exception_handler(DBAPIError)
async def database_driver_error_handler(request: Request, exc: DBAPIError) -> JSONResponse:
    # A generic driver error is only an outage when it invalidated the
    # connection. IntegrityError, DataError and ProgrammingError also subclass
    # DBAPIError, so anything else is re-raised and keeps its normal 500.
    if not getattr(exc, "connection_invalidated", False):
        raise exc
    return database_unavailable_response(request, exc)


for _connection_error in DATABASE_CONNECTION_ERRORS:
    app.add_exception_handler(_connection_error, database_connection_error_handler)
