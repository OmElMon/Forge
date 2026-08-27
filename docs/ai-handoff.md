# AI handoff context

This is the first file an AI coding assistant should read before continuing CrewPilot OS.
It is intentionally repo-safe: do not add secrets, private credentials, customer data, or sensitive market strategy here.

Last updated: 2026-08-27.

## Product in one sentence

CrewPilot OS is an AI-native operating system for home-service businesses, starting with HVAC-style field operations and designed to expand into other service verticals later.

The near-term product is a credible vertical SaaS MVP: authenticated workspaces, tenant-scoped CRM, jobs, technicians, scheduling, estimates, invoices, attention queues, audit trails, analytics, and production sanity checks.

The long-term product direction is automation over repetitive service-business workflows: intake, follow-up, dispatch, estimating, invoicing, reminders, and operational recommendations.

## Current project stage

Current stage: workflow MVP / operations foundation.

The app is past “static demo” and into “real SaaS workflow foundation.” It has a working backend, database migrations, tenant-aware APIs, authenticated dashboard pages, deployable services, and CI.

The next stage should focus on AI-ready operational events and dependable workflow depth before adding heavyweight AI/voice features.

## Repository map

- `apps/api` — FastAPI backend.
- `apps/web` — Next.js App Router frontend.
- `docs` — architecture, deployment, stability, security, workflow, and this handoff.
- `.github/workflows/ci.yml` — main CI for API and web.
- `.github/workflows/production-smoke.yml` — manual production smoke test.
- `docker-compose.yml` — local app stack.
- `netlify.toml` — Netlify frontend build configuration.

## Production shape

Canonical deployment shape:

- Frontend: Netlify, serving the Next.js web app.
- Backend: Render, serving the FastAPI API.
- Database: Supabase Postgres.
- Source of truth: GitHub `main`.

Netlify publishing may be locked or manually controlled to preserve build credits. Do not assume a frontend push automatically updates production UI.

Render runs API migrations during container startup through `apps/api/docker-entrypoint.sh`.

Production URLs currently used in code/docs:

- API: `https://crewpilotos.onrender.com`
- Web: `https://crewpilotos.netlify.app`

Do not commit real passwords, provider tokens, Supabase passwords, JWT secrets, API keys, or private reports.

## Important environment assumptions

Backend environment variables:

- `ENVIRONMENT=production`
- `DATABASE_URL=postgresql+asyncpg://...`
- `SECRET_KEY=<at least 32 random characters>`
- `CORS_ORIGINS=["https://crewpilotos.netlify.app/"]` or exact deployed frontend origin
- `REDIS_URL=redis://...` when background jobs are used

Frontend environment variables:

- `API_INTERNAL_URL=https://crewpilotos.onrender.com/api/v1`
- `NODE_VERSION=22`
- `PNPM_VERSION=11.7.0`
- `NEXT_TELEMETRY_DISABLED=1`

Supabase pooler URLs need asyncpg-safe behavior. The backend already normalizes Supabase pooler URLs in `apps/api/app/db/session.py` to disable prepared statement caching.

## What works now

Backend:

- Workspace registration and login.
- JWT access tokens and rotating refresh sessions.
- Tenant-scoped users, companies, memberships, customers, jobs, technicians, invoices, invoice line items, audit logs.
- Alembic migrations through `20260827_0014`.
- Row-level security enabled on application tables as defense in depth.
- Job workflows: schedule, assign, start, complete, cancel.
- Invoice workflows: send, approve, convert estimate to invoice, mark paid, void/reopen style transitions.
- Typed, tenant-scoped domain event stream (`/events`) emitted alongside audits for intake, follow-up, dispatch, estimate, invoice, and customer-touch lifecycles. Append-only, JSON payloads, correlation IDs link multi-step transitions (e.g. estimate convert → invoice).
- Customer profile depth: contact preferences (`preferred_contact`, `sms_opt_in`), service addresses, and equipment records on customers. `GET /customers/{id}` returns a `CustomerDetail` payload with lifetime value, paid invoice count, open work counts, open estimate/open invoice pipeline totals, plus the customer's addresses and equipment. Address and equipment CRUD under `/customers/{id}/addresses` and `/customers/{id}/equipment` are tenant-scoped and emit `customer.*` events + audit records.
- Workflow automation rules (first consumer of `/events`): an idempotent `automation_rules` service scans the tenant's event stream and materializes tenant-scoped follow-up tasks for estimate-sent, estimate-approved, and invoice-sent transitions. Estimate approval auto-resolves the earlier "awaiting follow-up" task. `GET /followups` materializes and commits pending follow-ups before listing (works without a background worker); `POST /followups/{id}/resolve` closes them with an audit record and emits `followup.created`/`followup.resolved` stream events. Dedupe: partial unique index on `(company_id, unique_key)` for open tasks.
- Scheduled/proactive delivery: each open follow-up is delivered exactly once when it crosses `due_at` — `deliver_due_followups` watermarks `delivered_at` and emits a typed `followup.due` stream event. `GET /followups` also runs due delivery, and a Celery beat schedule (`automation.followup_sweep` every 15m via the `beat` compose service, task in `app/worker_tasks.py`) sweeps all companies proactively so the queue stays current without web traffic. Tasks are thin wrappers; all logic stays in `automation_rules`. Message delivery (email/SMS adapters) is the next step after integration-ready boundaries.
- Dispatch depth: `GET /dispatch/suggestions?job_id=...` ranks technicians for an open job by confidence from real signals — `required_skills` skill fit (jobs carry a `required_skills` JSONB list), technician availability status, and schedule load (overlapping `scheduled_start` windows; open-job load proxy when unscheduled). Read-only; assignment stays on the existing `/jobs/{id}/assign`.
- Attention queue API for follow-up gaps and revenue risk.
- Analytics summary API for revenue, pipeline, conversion, job, and customer metrics.
- Health/readiness/status endpoints: `/health` liveness includes app+version; `/ready` now gates on database reachability AND migration current == head (503 on drift); `/status` reports database latency, migration current/head, environment, process `started_at`, and a sanitized failure `detail`. The API migration head is resolved relative to the module, not the process cwd.

Frontend:

- Login and workspace registration.
- Protected dashboard shell.
- Overview dashboard with live operational data.
- Customers page with create/list behavior and customer detail signals.
- Jobs page with workflow actions.
- Schedule page.
- Technicians page with workload/availability signals.
- Invoices page with estimate/invoice workflow.
- Analytics page wired to the analytics summary API.
- Settings page with operational setup guidance.

CI:

- API job installs dev deps, runs Ruff, format check, pytest, and Alembic SQL generation.
- Web job installs PNPM deps, runs typecheck, and production build.

## API endpoints to know

Base API prefix: `/api/v1`.

Public/system:

- `GET /health` — simple process health including app identity and version.
- `GET /ready` — database readiness + migration current/head in sync (503 "degraded" otherwise).
- `GET /status` — production status: database latency/detail, migration current/head, environment, started_at, version.

Auth:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Core resources:

- `/customers` — `GET /customers/{id}` returns `CustomerDetail` (LTV, open work, pipeline, addresses, equipment); nested `/{id}/addresses` and `/{id}/equipment` CRUD
- `/jobs`
- `/technicians`
- `/invoices`
- `/audit-logs`
- `/events` — AI/automation-readable event stream (filterable by `aggregate_type`, `aggregate_id`, `event_type`; newest first)
- `/followups` — automation follow-up queue (`GET` materializes, delivers due, commits; `POST /followups/{id}/resolve`)
- `/dispatch/suggestions` — read-only technician dispatch rankings for a job (`required_skills` fit, availability, schedule-load conflict)
- `/attention`
- `/analytics/summary`

The Next.js app proxies browser requests through `apps/web/app/api/*` route handlers so tokens stay in HttpOnly cookies.

## Known gaps

- The invoices UI performs revenue workflow transitions (send/approve/convert/paid/void) via generic `PATCH /invoices/{id}` instead of the dedicated workflow endpoints (`/send`, `/approve`, `/mark-paid`, `/convert-to-invoice`). The domain event stream classifies the resulting transitions, but the PATCH path bypasses transition guards and in-place "convert" does not copy line items or preserve the source estimate. Prefer migrating the UI to the dedicated endpoints.

## Data and tenancy rules

Every business-owned table must be scoped to `company_id`.

Do:

- Resolve tenant context from the authenticated principal.
- Filter queries by the principal company.
- Add audit logs for meaningful business actions.
- Keep mutations explicit and tested.
- Prefer typed Pydantic schemas and stable response shapes.

Do not:

- Accept trusted `company_id` from arbitrary browser payloads when it can be derived server-side.
- Add mock-only logic to production paths.
- Bypass authorization for AI, automation, or integration code.
- Write secrets into docs, tests, screenshots, or seed data.

## Build workflow for Codex or another LLM

When asked to continue building:

1. Read this file, `docs/workflows.md`, `docs/roadmap.md`, and `docs/stability.md`.
2. Check `git status --short`.
3. Pick one small high-leverage slice.
4. Prefer backend/API/platform work when Netlify credits are low or frontend publishing is locked.
5. Implement code with tests.
6. Run the smallest relevant checks locally.
7. Commit with a clear message.
8. Push to GitHub when the user has authorized the established workflow.
9. Watch GitHub Actions and fix failures before moving on.
10. End with what shipped, what passed, and the next recommended slice.

Autopilot mode is bounded. Do not run forever. One or two small connected slices per session is the preferred rhythm.

## Current recommended build queue

The AI-ready event model is in place (`/events`, typed `DomainEventType` catalog, append-only tenant-scoped stream), customer profile depth shipped (contact preferences, service addresses, equipment records, lifetime value + open work on `CustomerDetail`), workflow automation rules landed (follow-up tasks materialized from the event stream via `automation_rules`), production observability polish shipped (hardened `/health`, `/ready`, `/status`, and a sturdier production-smoke workflow with cold-start retries), and calendar/dispatch depth shipped (jobs carry `required_skills`; `GET /dispatch/suggestions` ranks technicians by skill fit, availability, and schedule load). A scheduled/proactive delivery pass is now in place too: beat-driven `automation.followup_sweep` sweeps every company and a `followup.due` watermark delivers each open follow-up exactly once. Remaining highest-value next slices:

1. Workflow automation rules depth (continued) — more rule types (job completed → invoice nudge), message delivery (email/SMS adapters; next step after integration boundaries).
2. Integration-ready boundaries — prepare clean adapter interfaces for voice, messaging, payments, and accounting.

Avoid jumping straight to “AI voice agent” implementation until the event model and workflow rules are stable. The assistant layer should automate solid workflows, not compensate for missing domain structure.

## Manual-only areas for Moe

The user owns:

- External account setup and billing.
- Provider permissions.
- Production secrets and environment variables.
- Supabase/Render/Netlify dashboard changes.
- Public launch timing.
- Customer/investor/recruiter sharing decisions.

An AI assistant may explain exactly what to click or what value format is needed, but should not invent or commit secret values.

## Validation commands

API:

```bash
cd apps/api
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/pytest
.venv/bin/alembic upgrade head --sql >/tmp/crewpilot-alembic-smoke.sql
```

Web:

```bash
cd apps/web
pnpm typecheck
pnpm build
```

GitHub:

```bash
gh run list --branch main --limit 5
gh run watch <run-id> --exit-status
```

Production smoke test can be run manually from GitHub Actions using `.github/workflows/production-smoke.yml`.

## Common production gotchas

- Supabase free projects can pause after inactivity; unpause before blaming app code.
- Supabase connection passwords with special characters must be URL-encoded, or use an alphanumeric password.
- Render free services spin down and cold starts can delay first requests.
- Render deploy failures often come from bad `DATABASE_URL`, migration drift, missing open port, or Supabase auth failures.
- Netlify credit warnings are not application failures.
- If Netlify auto-publishing is locked, frontend commits will not appear live until manually deployed.
- If Supabase security advisor reports public tables, enable RLS on app tables and `alembic_version`.

## Safe public framing

If explaining this project publicly:

> CrewPilot OS is a vertical SaaS operating system for home-service teams. It combines CRM, dispatch workflows, invoicing, analytics, and automation-ready event infrastructure into one tenant-scoped platform. I’m building it as a production-shaped project with FastAPI, Next.js, PostgreSQL, migrations, CI, cloud deployment, and security-conscious tenancy.

Avoid overclaiming that it is already a full AI voice-agent CRM. That is a future layer. The stronger current claim is that the foundation is being built for AI-native workflow automation.
