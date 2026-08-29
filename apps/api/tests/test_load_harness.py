"""Unit tests for the load/concurrency harness pure logic.

The async runner in ``scripts/load_test.py`` needs a live server; its real
exercise happens in CI (``.github/workflows/ci.yml`` concurrency job). Here we
pin down classification, aggregation, and threshold logic so the harness's
pass/fail contract is itself tested.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "load_test.py"
_spec = importlib.util.spec_from_file_location("load_test", _SCRIPT)
load_test = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
sys.modules["load_test"] = load_test
_spec.loader.exec_module(load_test)


def run(status: int | None, scenario: str, latency_ms: float = 10.0) -> load_test.Run:
    return load_test.Run(scenario=scenario, path="/x", status=status, latency_ms=latency_ms)


class TestClassify:
    def test_server_errors_and_transport_win(self) -> None:
        assert load_test.classify("read", 500) == "server_error"
        assert load_test.classify("login", 503) == "server_error"
        assert load_test.classify("login", None) == "transport"

    @pytest.mark.parametrize("scenario", ["login", "read"])
    def test_explicit_429_is_throttled_everywhere(self, scenario: str) -> None:
        assert load_test.classify(scenario, 429) == "throttled"

    def test_register_accepts_existing_account(self) -> None:
        assert load_test.classify("register", 201) == "ok"
        assert load_test.classify("register", 200) == "ok"
        assert load_test.classify("register", 409) == "ok"
        assert load_test.classify("register", 422) == "surprise"

    def test_attack_logins_expect_401_then_throttle(self) -> None:
        assert load_test.classify("attack", 401) == "ok"
        assert load_test.classify("attack", 429) == "throttled"
        assert load_test.classify("attack", 200) == "surprise"

    def test_probe_must_be_429(self) -> None:
        assert load_test.classify("probe", 429) == "ok"
        assert load_test.classify("probe", 200) == "surprise"

    def test_reads_and_logins_expect_2xx(self) -> None:
        assert load_test.classify("read", 200) == "ok"
        assert load_test.classify("login", 200) == "ok"
        assert load_test.classify("read", 401) == "surprise"
        assert load_test.classify("login", 401) == "surprise"


class TestSummarize:
    def test_counts_and_percentiles(self) -> None:
        runs = []
        latencies = [10.0 * i for i in range(10)]
        for latency in latencies:
            runs.append(run(200, "read", latency_ms=latency))
        runs.append(run(429, "login"))
        runs.append(run(None, "read"))

        summary = load_test.summarize(runs, elapsed_seconds=2.0)

        assert summary["total"] == 12
        assert summary["by_category"] == {
            "ok": 10,
            "throttled": 1,
            "surprise": 0,
            "server_error": 0,
            "transport": 1,
        }
        assert summary["by_status"] == {200: 10, 429: 1}
        assert summary["p50_ms"] == 40.0
        assert summary["p95_ms"] == 90.0
        assert summary["max_ms"] == 90.0
        assert summary["requests_per_second"] == 6.0

    def test_empty_input_is_safe(self) -> None:
        summary = load_test.summarize([], elapsed_seconds=1.0)

        assert summary["total"] == 0
        assert summary["by_category"] == {
            "ok": 0,
            "throttled": 0,
            "surprise": 0,
            "server_error": 0,
            "transport": 0,
        }
        assert summary["by_status"] == {}
        assert summary["p95_ms"] == 0.0
        assert summary["max_ms"] == 0.0


class TestViolations:
    def test_clean_summary_has_no_violations(self) -> None:
        happy = load_test.summarize([run(200, "read")], elapsed_seconds=1.0)
        assert load_test.violations(happy, max_p95_ms=1000.0) == []

    def test_server_errors_and_transport_are_violations(self) -> None:
        dirty = load_test.summarize(
            [run(503, "read"), run(None, "login"), run(200, "read")], elapsed_seconds=1.0
        )
        problems = load_test.violations(dirty, max_p95_ms=1000.0)
        assert any("5xx" in problem for problem in problems)
        assert any("transport" in problem for problem in problems)

    def test_p95_threshold(self) -> None:
        slow = load_test.summarize([run(200, "read", latency_ms=5000.0)], elapsed_seconds=1.0)
        problems = load_test.violations(slow, max_p95_ms=1000.0)
        assert any("p95" in problem for problem in problems)
        assert load_test.violations(slow, max_p95_ms=10000.0) == []


class TestParseArgs:
    def test_defaults(self) -> None:
        args = load_test.parse_args([])
        assert args.base_url == "http://127.0.0.1:8000/api/v1"
        assert args.concurrency == 8
        assert args.duration == 15.0
        assert args.max_p95_ms == 1000.0
        assert args.email_prefix.startswith("loadtest")

    def test_env_base_url_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LOAD_TEST_BASE_URL", "http://api:8000/api/v1")
        assert load_test.parse_args([]).base_url == "http://api:8000/api/v1"
        assert load_test.parse_args(["--base-url", "http://x/api/v1"]).base_url == "http://x/api/v1"
