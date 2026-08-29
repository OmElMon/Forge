# AI handoff context

This is the first file an AI coding assistant should read before continuing CrewPilot OS.
It is intentionally repo-safe: do not add secrets, private credentials, customer data, or sensitive market strategy here.

Last updated: 2026-08-29.

## Product in one sentence

CrewPilot OS is an AI-native operating system for home-service businesses, starting with HVAC-style field operations and designed to expand into other service verticals later.

The near-term product is a credible vertical SaaS MVP: authenticated workspaces, tenant-scoped CRM, jobs, technicians, scheduling, estimates, invoices, attention queues, audit trails, analytics, and production sanity checks.

The long-term product direction is automation over repetitive service-business workflows: intake, follow-up, dispatch, estimating, invoicing, reminders, and operational recommendations.

## Current project stage

Current stage: workflow MVP / operations foundation.

The app is past “static demo” and into “real SaaS workflow foundation.” It has a working backend, database migrations, tenant-aware APIs, authenticated dashboard pages, deployable services, CI, in-process rate limiting, a Render blueprint (`render.yaml`), and logical-backup tooling (`apps/api/scripts/backup_db.sh` / `make db-backup`).

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
- Alembic migrations through `20260827_0016`.
- Rate limiting keyed by client IP via `X-Forwarded-For`: auth endpoints capped at `rate_limit_auth_per_minute` (default 30/min) and the general API at `rate_limit_api_per_minute` (default 200/min), returning 429 + `Retry-After`. Health/ready/status/openapi/docs/root are exempt. Toggle with `rate_limiting_enabled`; backend selectable with `rate_limiter_backend` — `memory` (default, in-process `FixedWindowLimiter`) for single-instance, or `redis` (`RedisFixedWindowLimiter`, atomic INCR against window-slot keys over the shared `REDIS_URL`) once the API scales beyond one instance; the Redis limiter fails open on store errors so throttling never takes the API down.
- Integration-ready adapter boundaries (no live providers): ports in `app/services/integrations.py` (messaging/voice/payments/accounting), disabled-by-default adapter stubs in `app/integrations/`, env-gated via `settings.*_provider`, per-adapter event contracts in `docs/integration-contracts.md`. Activation is manual-only (user owns provider accounts/webhooks).
- Row-level security enabled on application tables as defense in depth.
- Job workflows: schedule, assign, start, complete, cancel.
- Invoice workflows: send, approve, convert estimate to invoice, mark paid, void/reopen style transitions.
- Typed, tenant-scoped domain event stream (`/events`) emitted alongside audits for intake, follow-up, dispatch, estimate, invoice, and customer-touch lifecycles. Append-only, JSON payloads, correlation IDs link multi-step transitions (e.g. estimate convert → invoice).
- Customer profile depth: contact preferences (`preferred_contact`, `sms_opt_in`), service addresses, and equipment records on customers, with customer list search/filtering (`GET /customers` accepts `search` free-text over name/phone/email and a `status` filter; the Customers dashboard mirrors that with a search box and status dropdown). `GET /customers/{id}` returns a `CustomerDetail` payload with lifetime value, paid invoice count, open work counts, open estimate/open invoice pipeline totals, plus the customer's addresses and equipment. Address and equipment CRUD under `/customers/{id}/addresses` and `/customers/{id}/equipment` are tenant-scoped and emit `customer.*` events + audit records. Customer bulk import: `POST /customers/import` accepts a UTF-8 CSV upload (`name` required; `phone`/`email`/`status`/`source`/`preferred_contact`/`sms_opt_in`/`notes` optional) and returns a per-row result (`created`, `skipped_rows`, row-level `errors` with row number/field/message); BOM and extra columns tolerated, duplicate email/phone within one file skipped, invalid rows never abort good ones, and each created customer emits `customer.created` + one `customer.import` audit entry. `GET /customers/import/template` downloads a header-only template.
- Workflow automation rules (first consumer of `/events`): an idempotent `automation_rules` service scans the tenant's event stream and materializes tenant-scoped follow-up tasks for estimate-sent, estimate-approved, and invoice-sent transitions. Estimate approval auto-resolves the earlier "awaiting follow-up" task. `GET /followups` materializes and commits pending follow-ups before listing (works without a background worker); `POST /followups/{id}/resolve` closes them with an audit record and emits `followup.created`/`followup.resolved` stream events. Dedupe: partial unique index on `(company_id, unique_key)` for open tasks.
- Scheduled/proactive delivery + messaging: each open follow-up is delivered exactly once when it crosses `due_at` — `run_followup_automation` (materialize → deliver → notify) watermarks `delivered_at`, emits `followup.due`, and sends the reminder through the messaging port (disabled by default; `recording` fake for tests). `GET /followups` runs the same pass, and a Celery beat schedule (`automation.followup_sweep` every 15m via the `beat` compose service, task in `app/worker_tasks.py`) sweeps all companies proactively so the queue stays current without web traffic. Tasks are thin wrappers; all logic stays in `automation_rules`. A `job.completed` rule materializes a "create and send invoice" follow-up (2 business days), and sending the invoice for that job auto-resolves it (`reason: "invoice.sent"`) — the job-to-invoice loop closes itself. Rules are policy-managed: a declared registry (`AUTOMATION_POLICIES` in `automation_rules.py`) with per-company toggles persisted in `automation_policies`; `GET /followups/rules` lists policies with enabled state and `PATCH /followups/rules/{rule_type}` flips them, and disabled policies stop materializing new follow-ups.
- Dispatch depth: `GET /dispatch/suggestions?job_id=...` ranks technicians for an open job by confidence from real signals — `required_skills` skill fit (jobs carry a `required_skills` JSONB list), technician availability status, and schedule load (overlapping `scheduled_start` windows; open-job load proxy when unscheduled). Read-only; assignment stays on the existing `/jobs/{id}/assign`.
- Attention queue API for follow-up gaps and revenue risk.
- Analytics summary API for revenue, pipeline, conversion, job, and customer metrics.
- Health/readiness/status endpoints: `/health` liveness includes app+version; `/ready` now gates on database reachability AND migration current == head (503 on drift); `/status` reports database latency, migration current/head, environment, process `started_at`, and a sanitized failure `detail`. The API migration head is resolved relative to the module, not the process cwd.

Frontend:

- Login and workspace registration.
- Protected dashboard shell.
- Overview dashboard with live operational data, including a revenue-recovery/attention panel, an outreach-queue panel that surfaces open/due-today/overdue follow-up counts with a link into the Follow-ups taskboard, and a lead-intake panel that shows presale touchpoints needing a response with a link into the Intake queue.
- Intake page: presale lead/call capture with create/list/filter behavior (status chips: new/contacted/converted/closed, kind filter, free-text search), inline edit, and a one-click "Convert to customer" action that creates a `LEAD` customer and lets the agent launch a job handoff for the new customer (title/amount/scheduled time/technician) right from the same record. New proxy routes under `apps/web/app/api/intake*` mirror the intake API. The Overview lead-intake panel and the left-nav "Intake" item link into it.
- Activity page: tenant-wide audit timeline (newest first, grouped by day) backed by `/api/audit-logs?limit=200`, with resource-type filter chips and human-readable action labels/icons.
- Customers page with create/list behavior and customer detail signals. List + profile now surface the full `CustomerDetail` depth through new proxy routes: lifetime value, open-work and pipeline stats, and inline management of service addresses and equipment (add/remove), plus preferred-contact and SMS opt-in editing. New proxy routes under `apps/web/app/api/customers/[id]/addresses*` and `.../equipment*` mirror the customers `/[id]` pattern.
- Jobs page with workflow actions.
- Schedule page surfaced dispatch optimization: the Unscheduled queue now shows a best-fit technician recommendation per open job (via `GET /dispatch/suggestions?job_id=...&limit=1`), with match % and matched/missing skills.
- Technicians page with workload/availability signals.
- Invoices page with estimate/invoice workflow.
- Analytics page wired to the analytics summary API.
- Follow-ups page: automation taskboard wired to the follow-up queue API — open/resolved filter, overdue/due-today signals, one-click resolve, and inline toggles for the policy registry (`/followups/rules`), so the automation layer is fully manageable from the dashboard.
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
- `POST /auth/password-reset` — requests a reset code for `email` (always answers identically for unknown accounts; stores a hashed single-use token; delivers through the messaging port)
- `POST /auth/password-reset/confirm` — redeems the code once, rotates the password hash, revokes all refresh sessions for the user, and writes an `auth.password_reset` audit entry

Core resources:

- `/customers` — `GET /customers/{id}` returns `CustomerDetail` (LTV, open work, pipeline, addresses, equipment); nested `/{id}/addresses` and `/{id}/equipment` CRUD
- `/jobs`
- `/technicians`
- `/invoices`
- `/intake` — presale lead/call capture (`GET` list with `status`/`kind` filters, `POST` create, `PATCH /{id}` update); `POST /intake/{id}/convert` creates a linked `LEAD` customer and emits `intake.record.converted` + `customer.created` events
- `/audit-logs`
- `/events` — AI/automation-readable event stream (filterable by `aggregate_type`, `aggregate_id`, `event_type`; newest first)
- `/followups` — automation follow-up queue (`GET` materializes, delivers due, commits; `POST /followups/{id}/resolve`); `/followups/rules` lists the policy registry and `PATCH /followups/rules/{rule_type}` toggles a company's enable/disable
- `/dispatch/suggestions` — read-only technician dispatch rankings for a job (`required_skills` fit, availability, schedule-load conflict)
- `/attention`
- `/analytics/summary`

The Next.js app proxies browser requests through `apps/web/app/api/*` route handlers so tokens stay in HttpOnly cookies.

## Known gaps

- The invoice workflow UI now drives send/approve/convert/mark-paid through the dedicated workflow endpoints via `app/api/invoices/[id]/[action]`; void and reopen-as-draft/sent transitions still flow through `PATCH /invoices/{id}` because no dedicated void/reopen endpoints exist.

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

1. Read this file, `docs/onboarding-milestones.md`, `docs/workflows.md`, `docs/roadmap.md`, and `docs/stability.md`.
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

A "levels 2–5" sprint shipped the buildable slices: workspace settings (`GET/PATCH /companies/me` — name, timezone, service area, default trade, notification prefs), an owner-only admin surface (`GET /admin/company`, `PATCH /admin/company/status`), a safe account-suspension path (suspended workspaces block member logins and every member request; owners retain the right to reactivate; `admin.company.suspended/reactivated` audit entries), request correlation IDs (`X-Request-ID` on every response + `request_id=` access log lines), audit/event search (`/audit-logs` now filters by actor and free-text `q` across action/resource/context), and a `billing_status` field for the future Stripe wiring. Follow-up delivery idempotency, the job→invoice and intake→customer→job loops, and cross-tenant scoping were verified with tests. Levels 2 (friendly testers), 3 (pilot business), 4 (paid pilot), and 5 (scalable launch) in `docs/onboarding-milestones.md` now show per-item done/pending status; everything still open is founder-owned account work (Stripe, messaging provider, Sentry DSN, backup restore drill, uptime monitor, legal review).

The production monitoring pass is complete: `docs/operations.md` is the ops runbook — how to run and interpret the Production Smoke Test workflow, the ordered database → API → frontend deploy checklist, a data-durability section (backup cadence, restore drill, roll-forward posture), provider-activation/consent notes, and a phased error-reporting integration plan (FastAPI + Next.js capture, alerting, guardrails) that stays a no-op until a real DSN is provided. Team invite basics now ships: owners/admins send role-based invites (`GET/POST /invites`, `POST /{id}/cancel`, `POST /{id}/resend`) delivered as single-use fingerprint-only email links with a 7-day expiry; outstanding invites for the same email are auto-expired; the public `GET /invites/preview` + `POST /auth/invites/accept` flow creates the user and tenant-scoped membership in one step (or adds a membership to an existing active user) and issues a signed-in session, writing `invite.*` audit entries. `GET /memberships` lists workspace members, `dashboard/team` manages invites with resend/cancel, office staff and technicians cannot send invites, admins cannot elevate to owner/admin, and the public `accept-invite` page completes onboarding. Password recovery now works end to end: `POST /auth/password-reset` issues a hashed, single-use, 30-minute reset token delivered through the messaging port (with an in-UI dev code when no real provider is configured), and `POST /auth/password-reset/confirm` redeems it once, rotates the password hash, revokes every refresh session, and writes an `auth.password_reset` audit entry; the `/forgot-password` and `/reset-password` pages complete the flow with a link from login. The dashboard now leads first-run owners through a setup checklist — add a customer (or convert an intake lead), create a job, send an estimate or invoice, and review the follow-up queue — with steps driven by live data and a completion state once the loop is closed. The invoices UI now drives its revenue workflow through the dedicated workflow endpoints (`app/api/invoices/[id]/[action]` for send/approve/convert/mark-paid), so transitions are guarded and estimate-to-invoice conversion copies line items into a fresh draft while preserving the source estimate. The AI-ready event model is in place (`/events`, typed `DomainEventType` catalog, append-only tenant-scoped stream), customer profile depth shipped (contact preferences, service addresses, equipment records, lifetime value + open work on `CustomerDetail`), workflow automation rules landed (follow-up tasks materialized from the event stream via `automation_rules`), production observability polish shipped (hardened `/health`, `/ready`, `/status`, and a sturdier production-smoke workflow with cold-start retries), and geography dispatch depth shipped (jobs carry `required_skills`; `GET /dispatch/suggestions` ranks technicians by skill fit, availability, and schedule load). Technician workload signals shipped too: `GET /technicians/{id}/workload` reports open/in-progress/scheduled job counts, next scheduled start, and the current in-progress job for a technician, alongside the status flags (availability/off-day handling) already modeled on `Technician`. A scheduled/proactive delivery pass is now in place too: beat-driven `automation.followup_sweep` sweeps every company via `run_followup_automation` (materialize → deliver due → notify) and a `followup.due` watermark delivers each open follow-up exactly once. Message delivery is wired: due follow-ups flow through the messaging port (`followup.due` → `MessagingProvider.send` with the follow-up's `correlation_id`, recipient resolved from customer `preferred_contact`/`sms_opt_in`). A new rule materializes a "create and send invoice" follow-up when a job completes. Integration-ready boundaries shipped: adapter ports live in `app/services/integrations.py`, disabled-by-default stub adapters in `app/integrations/` (messaging, voice, payments, accounting), provider choice gated by `settings.*_provider`, and per-adapter event contracts documented in `docs/integration-contracts.md`. The Customers UI now consumes the full `CustomerDetail` (LTV, open work/pipeline stats, service addresses, and equipment managed inline through new proxy routes). Automation rules are now policy-managed (declared registry + per-company `automation_policies` toggles via `/followups/rules`) and self-resolving (sending an invoice for a completed job auto-resolves its "create and send invoice" follow-up with `reason: "invoice.sent"`). Production hardening completed the ops foundation: in-process rate limiting (auth 30/min, API 200/min via `rate_limit_auth_per_minute`/`rate_limit_api_per_minute`), a Render blueprint (`render.yaml` covering api/worker/beat/redis), and logical-backup tooling (`apps/api/scripts/backup_db.sh`, `make db-backup`). Remaining highest-value next slices:

1. Finish intake/lead flow — done: intake records are exposed in a dedicated `/dashboard/intake` queue (proxy routes under `apps/web/app/api/intake*`), with create/list/filter, inline edit, one-click convert-to-customer, and an inline job handoff that launches a job for the new customer; the Overview dashboard surfaces intake needing a response.
2. Team invite basics — done: invite/role/accept/resend/cancel and tenant-safe membership creation (see summary above).
3. Workspace settings + owner admin surface — done: `GET/PATCH /companies/me` and `GET /admin/company` + `PATCH /admin/company/status`; dashboard Settings page doubles as the workspace profile editor and the owner-only workspace/billing card (suspend/reactivate).
4. Request correlation + audit search — done: `X-Request-ID` on every response with `request_id=` access logs; `/audit-logs` filters (action, resource type/id, actor, `q` text search).
5. Real messaging adapter wiring — the user activates a provider account and sets `messaging_provider=...`; the port, `sms_opt_in` consent path, and delivery are ready, and the follow-up policy surface can double as the settings UI for toggling rules.
6. Error reporting wiring — implement the `docs/operations.md` plan (sentry-sdk + @sentry/nextjs behind an empty-DSN no-op) once a DSN exists; everything else in the plan is ready to follow.
7. Durability drill — run one Supabase restore drill per `docs/operations.md` §4 (quarterly, founder-owned), then the backup story is non-theoretical.
8. Durable shared rate limiting — done: `rate_limiter_backend` (`memory` | `redis`) selects a Redis-backed `RedisFixedWindowLimiter` for the shared store (atomic INCR against window-slot keys, EXPIRE, same 429 + `Retry-After` contract, fails open if the store errors so throttling never downs the API). Default stays in-process `memory`; flip `RATE_LIMITER_BACKEND=redis` when the API runs more than one instance. Remaining Level 5 scaling item is load/concurrency testing plus worker-queue capacity verification.
9. Customer CSV import — done: `POST /customers/import` (multipart UTF-8 CSV) + `GET /customers/import/template`; row-level validation with a per-row error report, BOM/unknown-column tolerance, in-file duplicate email/phone skipping, per-customer `customer.created` events + one `customer.import` audit entry, all tenant-scoped. A web upload UI on the Customers page is the obvious follow-up if demo value warrants frontend credits.

Avoid jumping straight to “AI voice agent” implementation until the event model and workflow rules are stable. The assistant layer should automate solid workflows, not compensate for missing domain structure.

## Manual-only areas for Moe

The user owns:

- External account setup and billing (including connecting Stripe and defining the plan/subscription model).
- Provider permissions (messaging provider webhook secrets, provider upgrades).
- Production secrets and environment variables (app `SECRET_KEY`, `DATABASE_URL`, `SENTRY_DSN` when sentry-sdk is enabled).
- Supabase/Render/Netlify dashboard changes (including the quarterly backup restore drill and unpausing a paused database).
- Uptime monitor / external monitor choice and alerting contacts.
- Legal review (privacy/terms/data-deletion posture) and public launch timing.
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
