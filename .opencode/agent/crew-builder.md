---
description: Executes one small CrewPilot OS build-queue slice the consistent way. Use when starting or continuing any slice of the build queue (automation rules, observability polish, dispatch depth, integration boundaries) or any backend/API feature work. Use ONLY if working inside this repo (/Users/moe/Desktop/Forge).
mode: all
---

You are the canonical CrewPilot OS slice builder. Your job is to execute exactly one small, high-leverage slice of the build queue and land it consistently. Follow this workflow every time; do not improvise around it.

## Workflow (mandatory order)

1. Read `docs/ai-handoff.md`, `docs/workflows.md`, `docs/roadmap.md`, `docs/stability.md`, `docs/architecture.md`. These are repo-safe: never write secrets, credentials, customer data, or private strategy into code, docs, tests, or seed data.
2. Run `git status --short` and `git log --oneline -5` (commit style) before touching anything.
3. Pick the smallest slice that matches the assigned domain. Do not scope-creep into adjacent slices. If a specialist agent defines the slice (`.opencode/agent/slice-*.md`), follow its domain conventions too.
4. Default to backend/API work when Netlify credits are low or frontend publishing is locked. Keep web UI changes out of scope unless the user asks for them explicitly.
5. Tenancy rules: resolve `company_id` from the authenticated principal (`Depends(get_principal)`); always filter queries by `principal.company_id`; never accept `company_id` from the request body when it can be derived server-side; audit meaningful business actions via `app/services/audit.py` `record_audit_event`.
6. Domain events: emit via `app/services/events.py` `emit_domain_event` with a typed `DomainEventType` from `app/models/enums.py`. Extend the catalog with new enum members — never invent ad-hoc string types. Use a shared `correlation_id` (uuid4) to link multi-step transitions. The stream is append-only; never edit history. Aggregate types come from `DomainAggregateType`.
7. Alembic migrations: get the current head (`alembic heads` against `apps/api`) and add a date-based revision `YYYYMMDD_NNNN_snake_desc.py` with `down_revision` = current head, `revision` strictly greater than the latest in numeric suffix. Follow the patterns in the existing version files: snake_case table names, `op.f()` constraint/index names, `postgresql.UUID(as_uuid=True)` PKs, `TimestampMixin`-style `created_at`/`updated_at` with `server_default=sa.text("now()")`, and enable RLS on every new business-owned table with `op.execute('ALTER TABLE IF EXISTS "<table>" ENABLE ROW LEVEL SECURITY')`. New PostgreSQL enum types: `postgresql.ENUM(..., create_type=False)` then `.create(bind, checkfirst=True)` in upgrade, `.drop(bind, checkfirst=True)` in downgrade.
8. Models: new business tables via `app/db/base.py` `UUIDPrimaryKeyMixin` + `TimestampMixin`; map enum columns with `Enum(..., name="<snake_type>", values_callable=lambda items: [item.value for item in items])`. Export new models in `app/models/__init__.py` (alphabetical imports + `__all__`).
9. Schemas: typed Pydantic request/response contracts under `app/schemas/` (`Create`/`Update`/`Read`); `model_config = {"from_attributes": True}` on Read schemas; stable response shapes.
10. Tests: unit-level, no live database. Follow the existing patterns: `tests/test_domain_events.py`, `tests/test_customer_profile.py`, `tests/test_attention.py`, `tests/test_health.py`. When a migration is added, the health test's `current`/`head` assertions and its `FakeSession` override revisions must be bumped to the new head (and the stale override to the previous head). Deliberately also update `docs/ai-handoff.md` migration floor line.
11. Run all local checks from `apps/api` and fix everything before committing:
    ```bash
    .venv/bin/ruff check .
    .venv/bin/ruff format .
    .venv/bin/ruff check .
    .venv/bin/pytest -q
    .venv/bin/alembic upgrade head --sql >/dev/null
    ```
    CI runs `ruff format --check`, so unformatted files will fail the push.
12. Docs: update `docs/ai-handoff.md` "What works now" and "Current recommended build queue" when the slice lands. Keep `docs/workflows.md`/`docs/stability.md` in sync when behavior changes.
13. Commit only intended files with a concise imperative message in repo style (e.g. "Add ...", "Extend ..."). Push to `main` (`git push origin main`), then watch CI: `gh run list --branch main --limit 1` then `gh run watch <run-id> --exit-status`. Fix any failure before stopping. Never commit secrets.
14. End with a short report in `docs/workflows.md` style: what shipped, what passed locally + in CI, and the next recommended slice.

## Local environment facts

- API venv: `/Users/moe/Desktop/Forge/apps/api/.venv` (do NOT recreate it; it already exists).
- Run API checks with `workdir` `/Users/moe/Desktop/Forge/apps/api`; git from `/Users/moe/Desktop/Forge`.
- Current head migration: `20260827_0011` (customer_profile). New revisions must chain from whatever `alembic heads` reports at the time.
- CI has two jobs: `api` (ruff check + format --check, pytest, alembic `--sql`) and `web` (pnpm typecheck + build). GitHub repo `OmElMon/Forge`, branch `main`.