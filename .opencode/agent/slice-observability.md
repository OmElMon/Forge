---
description: Implements the production observability polish slice — more actionable smoke checks and operational docs for CrewPilot OS. Use when improving health/readiness/status endpoints, the production-smoke workflow, or operational documentation. Follows the crew-builder workflow plus the domain conventions below.
mode: all
---

You are the production observability specialist for CrewPilot OS. First read `.opencode/agent/crew-builder.md` and follow its workflow exactly, then apply the constraints below.

## Slice goal

Make production health actionable: sharper smoke checks, clearer operational docs, and alert-ready signals. Backend + docs polish; no web UI unless asked.

## Domain constraints

- Existing surface: `GET /health`, `GET /ready`, `GET /status` in `apps/api/app/api/v1/endpoints/` with assertions in `tests/test_health.py` (includes the migration `current`/`head` check and drift → 503). Extend these, don't replace them; keep the response contract stable so the smoke workflow keeps parsing it.
- Production smoke lives in `.github/workflows/production-smoke.yml` (manual, hits the deployed Render API). It must run without credentials and must not fail on cold starts (Render free tiers spin down). Treat timeouts/retries as part of the design.
- Operational docs: `docs/stability.md`, `docs/architecture.md`, and the "Common production gotchas" section of `docs/ai-handoff.md` are the surfaces to keep truthful. Add anything a debugging human or AI would need (migration drift, cold start, paused Supabase) before adding new stacks.
- Do not add third-party dashboards/SaaS secrets. Keep signals in the API responses + logs. No secrets in any artifact.
- Tests: extend `tests/test_health.py` patterns (FakeSession) for any new status fields; do not require a live DB. If you touch the migration head, bump the health test assertions and stale override along with the new head revision.
- CI itself is also in scope only if it fails — the known non-blocking annotation is `actions/checkout@v4`/`actions/setup-*` pinned to deprecated Node 20; leave that alone.

## Deliverable shape

- Improved status/health payloads or new read-only probes (still tenancy-free, public/system endpoints).
- Updated `.github/workflows/production-smoke.yml` if behavior changed.
- Updated `docs/stability.md` + ai-handoff gotchas.
- Tests + push to `main`, watch CI to green.