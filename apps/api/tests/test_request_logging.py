import logging

from fastapi.testclient import TestClient

import app.main as main_module


def test_every_response_carries_request_id() -> None:
    client = TestClient(main_module.app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["x-request-id"]


def test_incoming_request_id_is_reused() -> None:
    client = TestClient(main_module.app)
    response = client.get("/api/v1/status", headers={"X-Request-ID": "trace-abc-123"})
    assert response.headers["x-request-id"] == "trace-abc-123"


def test_request_log_line_contains_correlation_id(caplog) -> None:
    client = TestClient(main_module.app)
    with caplog.at_level(logging.INFO, logger="app.request"):
        response = client.get("/api/v1/health")
    request_id = response.headers["x-request-id"]

    lines = [
        record.getMessage()
        for record in caplog.records
        if record.name == "app.request" and "request completed" in record.getMessage()
    ]
    assert lines
    assert any(f"request_id={request_id}" in line for line in lines)


def test_throttled_request_keeps_request_id(monkeypatch, caplog) -> None:
    from app.core.ratelimit import FixedWindowLimiter

    monkeypatch.setattr(
        main_module,
        "API_RATE_LIMITER",
        FixedWindowLimiter(limit=1, window_seconds=60),
    )
    client = TestClient(main_module.app)

    with caplog.at_level(logging.INFO, logger="app.request"):
        client.get("/api/v1/customers")
        response = client.get("/api/v1/customers")

    assert response.status_code == 429
    assert response.headers["x-request-id"]

    lines = [
        record.getMessage()
        for record in caplog.records
        if record.name == "app.request" and "request completed" in record.getMessage()
    ]
    assert any(f"request_id={response.headers['x-request-id']}" in line for line in lines)
