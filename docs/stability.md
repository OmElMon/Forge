# Stability Stage

CrewPilot OS is currently in the workflow MVP stage. The immediate goal is to keep the project dependable while new product slices are added.

## Canonical production shape

- **Frontend:** Netlify hosts the Next.js web dashboard.
- **Backend:** Render hosts the FastAPI API.
- **Database:** Supabase Postgres is the production database.
- **Source of truth:** GitHub `main`.

Netlify should be treated as the public frontend layer, not the whole application platform. Render and Supabase are the backend source of truth.

## Deploy sanity checklist

Before chasing product bugs, verify the platform assumptions:

1. Render API is live and `/api/v1/ready` returns `{"status":"ready"}`.
2. Supabase is unpaused.
3. Render `DATABASE_URL` uses the encoded Supabase pooler URL with the `postgresql+asyncpg://` driver.
4. Render `CORS_ORIGINS` includes the exact Netlify frontend URL.
5. Netlify `API_INTERNAL_URL` points to the Render API `/api/v1` URL.
6. Alembic migrations completed during the latest Render deploy.

## Production status surface

- `GET /api/v1/health` — liveness only: app name, version, timestamp. No dependencies.
- `GET /api/v1/ready` — readiness: database reachable AND migration current matches head. Returns 503 with `{"status":"degraded", ...}` when either fails.
- `GET /api/v1/status` — detailed report: database latency, migration current/head (`drift` if out of sync), environment, process `started_at`, and version. Returns 503 when degraded. The database check includes a short sanitized `detail` message on failure.

The production smoke test (`.github/workflows/production-smoke.yml`, run from GitHub Actions with the frontend/API URLs) verifies these endpoints and asserts the migration status is `ok` — run it manually after deploys instead of guessing from a single curl. All smoke requests tolerate Render cold starts via retries.

### Debugging a degraded `/api/v1/status`

- `checks.database.status = "error"` — the API cannot reach Postgres. Check `DATABASE_URL` (Supabase pooler URL encoded, `postgresql+asyncpg://` prefix) and that Supabase is not paused. The `detail` field shows the sanitized error.
- `checks.migrations.status = "drift"` — `current` (DB `alembic_version`) differs from `head` (migration files). Re-run the API container so `docker-entrypoint.sh` applies pending migrations; verify `current` advances.
- `checks.migrations.status = "unknown"` — the API could not read `alembic_version` (pre-migration database) or the migration files; check the container still ships `alembic/versions`.

## Credit control

Netlify credit usage warnings are not application failures. If frontend build credits become noisy:

- pause Netlify auto-deploys temporarily;
- continue backend/API work through Render;
- trigger Netlify manually only when the public UI needs to refresh.

## Product progression

Current stage:

> Functional vertical SaaS MVP with core CRM, scheduling, jobs, and revenue workflows.

Next stability goals:

- keep settings/deployment assumptions visible in the app;
- reduce avoidable deploy surprises;
- keep seed/demo workflows safe;
- add analytics only after the core records are reliable;
- add AI automation after workflows have consistent data to automate.
