# Operations Runbook

Production monitoring for CrewPilot OS: how to run the smoke workflow, what to check on every deploy, and the plan for error reporting. This covers the "production monitoring pass" milestone (smoke workflow docs, deploy checklist, error-reporting integration plan).

## 1. Production smoke workflow

The smoke test lives in `.github/workflows/production-smoke.yml` and runs from GitHub Actions (no local replicate needed). It is the fastest way to verify that the deployed web + API stack actually answers in production — run it after every deploy instead of guessing from a single curl.

### How to run

From the repo on GitHub:

1. Actions → **Production Smoke Test** → **Run workflow**.
2. Leave the inputs at their defaults, or override for a staging URL:
   - `frontend_url` (default `https://crewpilotos.netlify.app`) — the Netlify site.
   - `api_url` (default `https://crewpilotos.onrender.com`) — the Render API base (no `/api/v1`).
   - `check_readiness` (default on) — also require `/api/v1/ready`, which includes the migration-drift check.
3. Wait for the `smoke` job (timeout 5 min). The job retries network calls so Render cold starts do not cause false failures.

### What each step verifies

| Step | URL hit | Passes when |
| --- | --- | --- |
| Check frontend | `GET {frontend_url}/` | 200 and HTML contains `CrewPilot OS` |
| Check API root | `GET {api_url}/` | 200 and body contains `CrewPilot OS API` |
| Check API health | `GET /api/v1/health` | liveness; body contains `"ok"` |
| Check API status is consistent | `GET /api/v1/status` | `status == "ok"`, `checks.database.status == "ok"`, `checks.migrations.status == "ok"`, and `current == head` |
| Check API readiness | `GET /api/v1/ready` (opt-in) | `"ready"` |

### Interpreting a failure

- **Frontend step fails** — the published Netlify site is unreachable or serving stale/an unrelated page. Check the Netlify deploy state, then `API_INTERNAL_URL`, then whether Netlify auto-publishing is locked (manual publish needed).
- **API root/health step fails** — Render is down or cold-starting past the retry window. Check the Render service logs and the free-tier spin-up behavior.
- **Status step fails**:
  - `checks.database.status == "error"` — API cannot reach Postgres. Verify `DATABASE_URL` (encoded Supabase pooler URL, `postgresql+asyncpg://` prefix) and that Supabase is not paused.
  - `checks.migrations.status == "drift"` — `current` differs from `head`. Re-run the API container so `docker-entrypoint.sh` applies pending migrations, then re-run the smoke workflow.
  - `current == null` or `head == null` — the API cannot read `alembic_version` or the `alembic/versions` files; check image contents.
- **Readiness step fails** (when enabled) — same as the status failure, surfaced at the lighter `/ready` endpoint.

## 2. Deploy checklist

Order matters: database → API → frontend. Verify each stage before moving on.

### Preflight (before any deploy)

- [ ] `git status --short` is clean and `main` has a passing CI run.
- [ ] Change is on `main` (no branch deploys).
- [ ] Supabase project is not paused; native backups are recent.
- [ ] A recent logical backup exists (`apps/api/scripts/backup_db.sh` / `make db-backup`) if this deploy is structural.
- [ ] Secrets exist in the provider dashboards: `SECRET_KEY` (≥ 32 chars), `DATABASE_URL`, `CORS_ORIGINS`, `API_INTERNAL_URL`.
- [ ] `GET /api/v1/status` reports `ok` on current production before changing anything.

### Database / Supabase

- [ ] New migrations are additive and tenant-scoped (RLS enabled on any new table).
- [ ] Baseline a backup if the release changes migrations.
- [ ] After deploy: `alembic_version` equals the migration head and Supabase security advisor shows no public app tables.

### Backend API (Render)

- [ ] Push to `main` triggers the Render web-service deploy; `docker-entrypoint.sh` runs `alembic upgrade head` on boot.
- [ ] If the payload changes Celery tasks, `crewpilot-worker` and `crewpilot-beat` are restarted too.
- [ ] After deploy: `GET /api/v1/status` returns `ok` with `current == head`, and `GET /api/v1/ready` returns `"ready"`.

### Frontend (Netlify)

- [ ] Auto-deploy builds `apps/web`; if publishing is locked, trigger the publish manually before considering the deploy live.
- [ ] After deploy: the smoke frontend check passes and a login/register round-trip hits the production API (verify `API_INTERNAL_URL`).

### Post-deploy verification

- [ ] Run the **Production Smoke Test** workflow end to end (all steps pass).
- [ ] Open the app and walk one happy path (login → dashboard → a read-only list page).
- [ ] File the deploy outcome in the session handoff.

## 3. Error-reporting integration plan

No provider is wired yet; nothing in this plan is active until a DSN/account is provided. Every hook below must degrade to a no-op when the DSN is empty so local development and CI behavior never change.

### Principles

- **Errors vs. business events.** App failures → error reporter. Expected/controlled outcomes (401, 403, 409, 422, 429) are not errors and must be filtered out. Meaningful business actions already live in `audit_logs` / the `/events` stream — do not duplicate them into error reports.
- **No secrets, no raw user data.** Never send cookies, `Authorization` headers, passwords, or invite/reset codes. Invite and reset tokens are stored fingerprint-only, so a leaked trace cannot disclose them. Attach only coarse context: `company_id`, `user_id`, `request_id`, `path`.
- **Release tracking.** Use the same version the health surface exposes (`apps/api` → `api_version()`, fallback `0.1.0`) plus the commit SHA so a trace maps to a deploy.

### Phase 1 — FastAPI error capture (sentry-sdk, ASGI)

- Add `SENTRY_DSN` (and `SENTRY_TRACES_SAMPLE_RATE`, default `0` for prod unless opted in) to `app/core/config.py`.
- In `app/main.py`, lazily `sentry_sdk.init(...)` only when `settings.sentry_dsn` is set, with `environment=settings.environment`, `release=api_version()`, and integrations `FastApiIntegration` + `SqlalchemyIntegration`.
- Attach scope tags when the principal is available (in the `get_principal` dependency in `app/api/deps.py`): `app=api`, `company_id`, `request_id`.
- Add a `before_send` filter that drops `HTTPException` with `status_code < 500` and the rate-limit 429 (those are probed behavior, not defects). Database connectivity and unexpected `Exception` routes in `/health`, `/ready`, `/status` are already guarded (`_sanitized_error`) — capture at `warning` in logs, do not page on them.
- Add request-scoped structured logging (a small middleware emitting `request_id`, `method`, `path`, `status`, `duration_ms`, `company_id` when known) so a Sentry event can be correlated with API logs.

### Phase 2 — Next.js error capture (@sentry/nextjs)

- Add `@sentry/nextjs` to `apps/web` with the standard `sentry.client.config.ts` / instrumentation; wire the DSN from `NEXT_PUBLIC_SENTRY_DSN`.
- Route-handler proxies already convert upstream failures to stable 503s; report the *proxy* outcome plus the upstream `status` so UI errors trace back to the API.
- Set user context from the session only when `Principal` is present (never send the access token).
- Keep the existing in-UI error banners; error reporting should complement, not replace, user-facing messages.

### Phase 3 — alerting and escalation

- **Alert rules (once a reporter is live):** new issue for 5xx, error volume spike per company, p95 API latency breach. 4xx and 429 excluded at the source.
- **Severity map:** backend 5xx / DB-down events page; UI-only path errors feed a daily digest; rate-limiter events are informational.
- **Optional cron smoke:** enable the smoke workflow on a schedule (add a `schedule` trigger to `production-smoke.yml`; the `workflow_dispatch` inputs resolve to their defaults) for daily uptime signal in addition to deploy-time runs.
- **Weekly triage:** review new issues, close expected/known events, and align releases so fixed issues close automatically.

### Guardrails

- This plan is only implemented as a dedicated slice after a DSN/account owner exists; nothing here is enabled by settings defaults.
- A Sentry account identifier, DSN, and alerting contacts are user-owned setup items (see `docs/ai-handoff.md` → "Manual-only areas").
- Never commit a DSN; supply it only through provider environment variables.