from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.exc import DBAPIError, OperationalError

from app.api.deps import get_principal
from app.main import DATABASE_UNAVAILABLE_DETAIL, app


def _call_with_principal_failure(exc: Exception) -> Response:
    async def unavailable():
        raise exc

    app.dependency_overrides[get_principal] = unavailable
    try:
        return TestClient(app, raise_server_exceptions=False).get("/api/v1/customers")
    finally:
        app.dependency_overrides.clear()


def test_connect_time_failure_returns_retryable_503() -> None:
    response = _call_with_principal_failure(
        ConnectionRefusedError("connection refused for sentinel-host-9f3a")
    )
    assert response.status_code == 503
    assert response.json() == {"detail": DATABASE_UNAVAILABLE_DETAIL}
    assert response.headers["Retry-After"] == "5"


def test_driver_level_failure_returns_retryable_503() -> None:
    response = _call_with_principal_failure(
        OperationalError("SELECT 1", {}, Exception("server closed the connection unexpectedly"))
    )
    assert response.status_code == 503
    assert response.json() == {"detail": DATABASE_UNAVAILABLE_DETAIL}


def test_database_outage_response_never_leaks_driver_detail() -> None:
    response = _call_with_principal_failure(
        ConnectionRefusedError("connection refused for sentinel-host-9f3a")
    )
    assert "sentinel-host-9f3a" not in response.text
    assert "ConnectionRefusedError" not in response.text


def test_handlers_registered_on_the_app() -> None:
    assert ConnectionError in app.exception_handlers
    assert DBAPIError in app.exception_handlers


def test_expected_client_errors_are_unaffected() -> None:
    # A rejected credential must still be a 401, not misreported as an outage.
    app.dependency_overrides.pop(get_principal, None)
    response = TestClient(app, raise_server_exceptions=False).get(
        "/api/v1/customers", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401
    assert DATABASE_UNAVAILABLE_DETAIL not in response.text
