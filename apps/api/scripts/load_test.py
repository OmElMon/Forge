"""API load and concurrency harness for CrewPilot OS.

Drives a running ``/api/v1`` API with concurrent register + login + read
storms and checks server integrity under concurrency: no HTTP 5xx, no
transport errors, sane p95 latency, and login throttling (account lockout /
rate limiting) that genuinely engages.

Pure pieces (``classify``, ``summarize``, ``violations``, ``parse_args``)
are unit-tested in ``tests/test_load_harness.py`` so the harness does not
need a live server in CI; the async runner is exercised end-to-end by the
``concurrency`` job in ``.github/workflows/ci.yml``.

Run against a local stack (defaults assume a db-backed API on :8000):

    docker compose up -d postgres redis api
    cd apps/api
    .venv/bin/python scripts/load_test.py --concurrency 8 --duration 15

or from inside the API container against the compose ``api`` service:

    docker compose run --rm api python scripts/load_test.py \\
        --base-url http://api:8000/api/v1

Recommended between runs: restart the API so in-memory lockout state (15 min
ban window) does not carry over and starve the next run's legit logins.
"""

from __future__ import annotations

import argparse
import asyncio
import math
import os
import random
import time
from dataclasses import dataclass

import httpx


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__.splitlines()[0],
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000/api/v1",
        help="Base URL of the API to drive (may also be set via LOAD_TEST_BASE_URL).",
    )
    parser.add_argument("--concurrency", type=int, default=8, help="Concurrent worker tasks.")
    parser.add_argument(
        "--duration", type=float, default=15.0, help="Storms run for this many seconds."
    )
    parser.add_argument("--email-prefix", default=None, help="Unique prefix for generated emails.")
    parser.add_argument(
        "--password", default="LoadTestPass2026!", help="Password for generated accounts."
    )
    parser.add_argument(
        "--seed-customers", type=int, default=6, help="Customers created before the read storm."
    )
    parser.add_argument(
        "--max-p95-ms",
        type=float,
        default=1000.0,
        help="Fail if cross-request p95 latency exceeds this.",
    )
    args = parser.parse_args(argv if argv is not None else None)
    if args.email_prefix is None:
        args.email_prefix = f"loadtest{int(time.time())}"
    if not argv and os.getenv("LOAD_TEST_BASE_URL"):
        args.base_url = os.getenv("LOAD_TEST_BASE_URL", args.base_url)
    return args


@dataclass
class Run:
    """One observed request in a storm."""

    scenario: str
    path: str
    status: int | None  # None means the transport layer raised.
    latency_ms: float


def classify(scenario: str, status: int | None) -> str:
    """Bucket a response into ``ok``/``throttled``/``surprise``/``server_error``/``transport``.

    ``ok`` is scenario-dependent: attack logins legitimately 401 until the
    account locks, registration 409s mean a prior run's account already
    exists, and the lockout probe must get 429. ``throttled`` is always 429.
    Anything else is a surprise.
    """
    if status is None:
        return "transport"
    if status >= 500:
        return "server_error"
    if scenario == "probe":
        return "ok" if status == 429 else "surprise"
    if status == 429:
        return "throttled"
    if scenario == "register":
        return "ok" if status in (200, 201, 409) else "surprise"
    if scenario == "attack":
        return "ok" if status == 401 else "surprise"
    return "ok" if 200 <= status < 300 else "surprise"


def summarize(runs: list[Run], elapsed_seconds: float) -> dict[str, object]:
    """Aggregate observed runs into a reportable summary."""
    categories = ("ok", "throttled", "surprise", "server_error", "transport")
    by_category: dict[str, int] = dict.fromkeys(categories, 0)
    by_status: dict[int, int] = {}
    latencies: list[float] = []
    for run in runs:
        by_category[classify(run.scenario, run.status)] += 1
        if run.status is not None:
            by_status[run.status] = by_status.get(run.status, 0) + 1
            latencies.append(run.latency_ms)
    latencies.sort()
    n = len(latencies)

    def percentile(pct: float) -> float:
        if not latencies:
            return 0.0
        rank = math.ceil(pct * n / 100.0)
        return latencies[rank - 1]

    return {
        "total": len(runs),
        "by_category": by_category,
        "by_status": by_status,
        "p50_ms": percentile(50),
        "p95_ms": percentile(95),
        "p99_ms": percentile(99),
        "max_ms": latencies[-1] if latencies else 0.0,
        "requests_per_second": round(len(runs) / elapsed_seconds, 1)
        if elapsed_seconds > 0
        else 0.0,
    }


def violations(summary: dict[str, object], *, max_p95_ms: float) -> list[str]:
    """Return violation strings; an empty list means the server passed."""
    problems: list[str] = []
    by_category: dict[str, int] = summary["by_category"]
    if by_category["server_error"]:
        problems.append(f"{by_category['server_error']} HTTP 5xx responses")
    if by_category["transport"]:
        problems.append(f"{by_category['transport']} transport/connection errors")
    if summary["p95_ms"] and summary["p95_ms"] > max_p95_ms:
        problems.append(f"p95 latency {summary['p95_ms']:.0f}ms exceeds {max_p95_ms:.0f}ms")
    return problems


def render(summary: dict[str, object], problems: list[str]) -> str:
    lines = [
        f"requests:        {summary['total']}   ({summary['requests_per_second']} req/s)",
        f"ok / throttled:  {summary['by_category']['ok']} / {summary['by_category']['throttled']}",
        f"server_errors:   {summary['by_category']['server_error']}",
        f"transport:       {summary['by_category']['transport']}",
        f"surprise:        {summary['by_category']['surprise']}",
        f"by_status:       {dict(sorted(summary['by_status'].items()))}",
        f"latency ms:      p50={summary['p50_ms']:.0f} p95={summary['p95_ms']:.0f} "
        f"p99={summary['p99_ms']:.0f} max={summary['max_ms']:.0f}",
    ]
    if problems:
        lines.append("VIOLATIONS:")
        lines.extend(f"  - {problem}" for problem in problems)
    else:
        lines.append("no violations: server stayed up under concurrency")
    return "\n".join(lines)


async def one_request(
    client: httpx.AsyncClient,
    *,
    scenario: str,
    url: str,
    method: str = "GET",
    payload: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    jitter_ms: float = 0.0,
) -> Run:
    started = time.perf_counter()
    try:
        response = await client.request(method, url, json=payload, headers=headers)
        status: int | None = response.status_code
    except httpx.HTTPError:
        status = None
    latency_ms = (time.perf_counter() - started) * 1000
    if jitter_ms:
        await asyncio.sleep(random.random() * jitter_ms / 1000)
    return Run(scenario=scenario, path=url, status=status, latency_ms=latency_ms)


async def verify_reachable(client: httpx.AsyncClient, base_url: str) -> None:
    for attempt in range(60):
        try:
            response = await client.get(f"{base_url}/ready")
            if response.status_code < 500 and "ready" in response.text:
                return
        except httpx.HTTPError:
            pass
        if attempt % 5 == 4:
            print(f"  waiting for readiness ({attempt + 1}/60)...")
        await asyncio.sleep(1)
    raise SystemExit("API never became ready; check DATABASE_URL/migrations and uvicorn logs")


async def ensure_account(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    email: str,
    password: str,
    prefix: str,
) -> Run:
    return await one_request(
        client,
        scenario="register",
        url=f"{base_url}/auth/register",
        method="POST",
        payload={
            "company_name": f"{prefix} {email.split('@')[0]}",
            "full_name": "Load Test",
            "email": email,
            "password": password,
        },
        jitter_ms=5,
    )


async def login(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    email: str,
    password: str,
    scenario: str = "login",
) -> Run:
    return await one_request(
        client,
        scenario=scenario,
        url=f"{base_url}/auth/login",
        method="POST",
        payload={"email": email, "password": password},
        jitter_ms=5,
    )


async def auth_storm(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    deadline: float,
    account: str,
    password: str,
    prefix: str,
) -> list[Run]:
    """Register one account then churn correct logins until ``deadline``."""
    runs = [
        await ensure_account(
            client, base_url=base_url, email=account, password=password, prefix=prefix
        )
    ]
    while time.monotonic() < deadline:
        batch = await asyncio.gather(
            *(login(client, base_url=base_url, email=account, password=password) for _ in range(3))
        )
        runs.extend(batch)
        await asyncio.sleep(0.05)
    return runs


async def read_storm(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    deadline: float,
    token: str,
) -> list[Run]:
    """Concurrent authenticated list reads until ``deadline``."""
    paths = ["/customers", "/jobs", "/invoices", "/technicians", "/auth/me"]
    headers = {"Authorization": f"Bearer {token}"}
    runs: list[Run] = []
    while time.monotonic() < deadline:
        batch = await asyncio.gather(
            *(
                one_request(
                    client,
                    scenario="read",
                    url=f"{base_url}{path}",
                    headers=headers,
                    jitter_ms=10,
                )
                for path in random.sample(paths, 2)
            )
        )
        runs.extend(batch)
    return runs


async def fetch_token(
    client: httpx.AsyncClient, *, base_url: str, email: str, password: str
) -> str:
    response = await client.post(
        f"{base_url}/auth/login", json={"email": email, "password": password}
    )
    return response.json().get("access_token") or ""


async def lockout_probe(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    attack_email: str,
    password: str,
) -> tuple[Run, Run]:
    """Hammer one account with wrong passwords, then probe with the correct one.

    Returns ``(last_attack, probe)``. The probe must be 429 once lockout (or
    the shared IP limit) engages; a 200 means brute-force defense never fired.
    """
    last_attack = await login(
        client, base_url=base_url, email=attack_email, password="definitely-wrong"
    )
    for _ in range(40):
        if last_attack.status == 429:
            break
        last_attack = await login(
            client,
            base_url=base_url,
            email=attack_email,
            password="definitely-wrong",
            scenario="attack",
        )
    probe = await login(
        client, base_url=base_url, email=attack_email, password=password, scenario="probe"
    )
    return last_attack, probe


async def run(args: argparse.Namespace) -> int:
    print(f"driving {args.base_url} concurrency={args.concurrency} duration={args.duration}s")
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(10.0, connect=5.0),
        limits=httpx.Limits(max_connections=args.concurrency * 2 + 4),
    ) as client:
        await verify_reachable(client, args.base_url)

        accounts = [f"{args.email_prefix}-{i:03d}@example.com" for i in range(args.concurrency)]
        storm_runs: list[Run] = []

        now = time.monotonic()
        auth_deadline = now + args.duration * 0.6
        read_deadline = now + args.duration

        auth_results = await asyncio.gather(
            *(
                auth_storm(
                    client,
                    base_url=args.base_url,
                    deadline=auth_deadline,
                    account=account,
                    password=args.password,
                    prefix=args.email_prefix,
                )
                for account in accounts
            )
        )
        for result in auth_results:
            storm_runs.extend(result)

        token = await fetch_token(
            client, base_url=args.base_url, email=accounts[0], password=args.password
        )
        if token:
            headers = {"Authorization": f"Bearer {token}"}
            for i in range(args.seed_customers):
                response = await client.post(
                    f"{args.base_url}/customers",
                    headers=headers,
                    json={"name": f"{args.email_prefix} customer {i}"},
                )
                if response.status_code >= 400:
                    print(f"  warning: customer seed {i} -> {response.status_code}")
        else:
            print("  warning: no access token, read storm will return 401s")

        read_results = await asyncio.gather(
            *(
                read_storm(client, base_url=args.base_url, deadline=read_deadline, token=token)
                for _ in range(args.concurrency)
            )
        )
        for result in read_results:
            storm_runs.extend(result)

        last_attack, probe = await lockout_probe(
            client,
            base_url=args.base_url,
            attack_email=f"{args.email_prefix}-attack@example.com",
            password=args.password,
        )
        storm_runs.extend([last_attack, probe])

        elapsed = time.monotonic() - now
        summary = summarize(storm_runs, elapsed)
        problems = violations(summary, max_p95_ms=args.max_p95_ms)
        if probe.status != 429:
            problems.append(
                f"locked-account probe returned {probe.status}, expected 429 "
                "(login lockout did not engage)"
            )
        for problem in problems:
            print(f"  FAIL: {problem}")
        print(render(summary, problems))
        return 1 if problems else 0


async def main() -> None:
    args = parse_args()
    raise SystemExit(await run(args))


if __name__ == "__main__":
    asyncio.run(main())
