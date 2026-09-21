"""Only connection-level database failures may be reported as a retryable outage.

An IntegrityError, DataError, ProgrammingError, or constraint violation is an
application defect: it must keep failing as a 500 so clients do not retry
something that will fail identically. These tests pin that boundary down.
"""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.exc import (
    DataError,
    DBAPIError,
    DisconnectionError,
    IntegrityError,
    InterfaceError,
    OperationalError,
    ProgrammingError,
)
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError

from app.api.deps import get_principal
from app.main import (
    DATABASE_CONNECTION_ERRORS,
    DATABASE_UNAVAILABLE_DETAIL,
    DATABASE_UNAVAILABLE_RETRY_AFTER_SECONDS,
    app,
)

SENTINEL = "sentinel-host-9f3a"

# Every exception below means "the database could not be reached or the
# connection died" and must be answered with a retryable, sanitized 503.
CONNECTION_FAILURES = [
    ConnectionRefusedError(f"connection refused for {SENTINEL}"),
    OperationalError("SELECT 1", {}, ConnectionRefusedError(SENTINEL)),
    InterfaceError("connection is closed", {}, ConnectionRefusedError(SENTINEL)),
    DisconnectionError("connection invalidated", {}, ConnectionRefusedError(SENTINEL)),
    SQLAlchemyTimeoutError("QueuePool limit of size 5 overflow 10 reached"),
]

# Every exception below is an application/driver error, not database downtime.
APPLICATION_FAILURES = [
    IntegrityError("INSERT ...", {}, Exception("duplicate key value violates unique constraint")),
    DataError("SELECT ...", {}, Exception("invalid input syntax for type integer")),
    ProgrammingError("SELECT ...", {}, Exception("column does not exist")),
    ConnectionError(SENTINEL),
    OSError(SENTINEL),
]


def _client_for(exc: Exception) -> Response:
    """Run a real authenticated endpoint whose dependency raises `exc`."""

    async def exploding_dependency():
        raise exc

    app.dependency_overrides[get_principal] = exploding_dependency
    try:
        return TestClient(app, raise_server_exceptions=False).get("/api/v1/customers")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("exc", CONNECTION_FAILURES, ids=lambda exc: type(exc).__name__)
def test_connection_failures_return_sanitized_503(exc: Exception) -> None:
    response = _client_for(exc)

    assert response.status_code == 503, f"{type(exc).__name__} should be a retryable outage"
    assert response.json() == {"detail": DATABASE_UNAVAILABLE_DETAIL}
    assert response.headers["Retry-After"] == str(DATABASE_UNAVAILABLE_RETRY_AFTER_SECONDS)


@pytest.mark.parametrize("exc", APPLICATION_FAILURES, ids=lambda exc: type(exc).__name__)
def test_application_failures_are_not_reported_as_outage(exc: Exception) -> None:
    response = _client_for(exc)

    assert response.status_code != 503, f"{type(exc).__name__} must not be an outage"
    assert response.status_code == 500
    assert DATABASE_UNAVAILABLE_DETAIL not in response.text
    assert "Retry-After" not in response.headers


def test_invalidated_driver_error_is_an_outage() -> None:
    exc = DBAPIError("SELECT 1", {}, ConnectionRefusedError(SENTINEL), connection_invalidated=True)
    response = _client_for(exc)

    assert response.status_code == 503
    assert response.json() == {"detail": DATABASE_UNAVAILABLE_DETAIL}


def test_non_invalidated_driver_error_is_not_an_outage() -> None:
    exc = DBAPIError("SELECT 1", {}, Exception("boom"), connection_invalidated=False)
    response = _client_for(exc)

    assert response.status_code == 500
    assert DATABASE_UNAVAILABLE_DETAIL not in response.text


@pytest.mark.parametrize("exc", CONNECTION_FAILURES, ids=lambda exc: type(exc).__name__)
def test_outage_responses_never_leak_driver_detail(exc: Exception) -> None:
    response = _client_for(exc)

    assert SENTINEL not in response.text
    assert "connection refused" not in response.text.lower()
    assert "QueuePool" not in response.text
    assert type(exc).__name__ not in response.text


@pytest.mark.parametrize("status", [400, 401, 403, 404, 409, 422])
def test_normal_client_errors_are_unchanged(status: int) -> None:
    async def raise_http_error():
        raise HTTPException(status_code=status, detail=f"expected {status}")

    app.dependency_overrides[get_principal] = raise_http_error
    try:
        response = TestClient(app, raise_server_exceptions=False).get("/api/v1/customers")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == status
    assert response.json() == {"detail": f"expected {status}"}


def test_real_unauthenticated_request_is_still_401() -> None:
    response = TestClient(app, raise_server_exceptions=False).get("/api/v1/customers")

    assert response.status_code == 401
    assert DATABASE_UNAVAILABLE_DETAIL not in response.text


def test_real_validation_failure_is_still_422() -> None:
    response = TestClient(app, raise_server_exceptions=False).post("/api/v1/auth/register", json={})

    assert response.status_code == 422
    assert DATABASE_UNAVAILABLE_DETAIL not in response.text


def test_only_connection_specific_handlers_are_registered() -> None:
    for exc_type in DATABASE_CONNECTION_ERRORS:
        assert exc_type in app.exception_handlers, f"{exc_type.__name__} handler missing"

    # The broad bases must NOT be registered, or unrelated failures would be
    # misreported as database downtime.
    for exc_type in (ConnectionError, OSError, Exception):
        assert exc_type not in app.exception_handlers, f"{exc_type.__name__} must not be caught"
