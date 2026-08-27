# CrewPilot OS

CrewPilot OS is an AI-native operating system for home service businesses. The first market is HVAC, while the domain and tenant boundaries are designed for other field-service verticals.

It is being built as a realistic SaaS-style product: authenticated workspaces, tenant-scoped data, CRM records, jobs, scheduling, estimates, invoices, and revenue-aware dashboards.

## What is working now

- Workspace registration/login with JWT access tokens and rotating refresh sessions
- Tenant-scoped customers, jobs, estimates, and invoices
- Dashboard metrics backed by live customer/job/invoice data
- Customer profiles with recent jobs and revenue summaries
- Jobs and schedule views for dispatch-style operations
- Estimates/invoices workflow, including estimate-to-invoice conversion and paid/open revenue tracking
- Settings/operations page that documents the canonical deployment shape and sanity checks
- PostgreSQL migrations through Alembic, with row-level security enabled on app tables
- Render-ready API deployment and Netlify-compatible web configuration

## Tech stack

- `apps/api` — FastAPI, SQLAlchemy 2, PostgreSQL, Alembic, JWT auth, tenant-scoped models
- `apps/web` — Next.js App Router, TypeScript, Tailwind CSS, responsive product shell
- Infrastructure — PostgreSQL, Redis, Celery, Docker Compose, Render, Supabase Postgres
- Architecture decisions and the delivery roadmap live in `docs/`

## Start locally

1. Copy `.env.example` to `.env` and replace `SECRET_KEY`.
2. Run `docker compose up --build`.
3. Open the web app at http://localhost:3000 and API docs at http://localhost:8000/docs.

Apply migrations with:

```bash
docker compose exec api alembic upgrade head
```

## Demo data

After the API is running and migrations are applied, seed a local demo workspace:

```bash
make demo-seed
```

Demo login:

```text
Email: demo@crewpilot.local
Password: CrewPilotDemo2026
```

The seed script creates a realistic workspace with customers, scheduled jobs, estimates, invoices, and paid/open revenue. It is idempotent for the demo company: rerunning it replaces the demo business records instead of duplicating them.

Safety note: the seed script refuses to run when `ENVIRONMENT=production` unless `CREWPILOT_ALLOW_PRODUCTION_SEED=true` is explicitly set.

## Deploy

The current production shape uses:

- Render for the FastAPI backend
- Supabase Postgres for the database
- Netlify-compatible frontend configuration via `netlify.toml`

See `docs/deployment.md` for the Netlify settings and backend environment variables.

Render runs Alembic migrations on deploy through `apps/api/docker-entrypoint.sh`.

See `docs/stability.md` for the current production assumptions, credit-control guidance, and deploy sanity checklist.

## Workflow

CrewPilot OS ships in small vertical slices. See `docs/workflows.md` for what should be handled manually, what Codex can automate, and how each feature should move from local changes to production validation.

If another AI assistant or a future Codex session continues the project, start with `docs/ai-handoff.md`.

## Next product slices

- AI-ready event model for intake, follow-up, dispatch, estimate, invoice, and customer-touch events
- Customer profile depth: service addresses, equipment notes, preferences, lifetime value, and open work
- Workflow automation rules for reminders, follow-ups, and dispatch gaps
- Calendar/dispatch depth and integration-ready adapter boundaries
