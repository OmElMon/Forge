# Forge

Forge is an AI-native operating system for home service businesses. The first market is HVAC, while the domain and tenant boundaries are designed for other field-service verticals.

## Foundation

- `apps/api` — FastAPI, SQLAlchemy 2, PostgreSQL, Alembic, JWT auth, tenant-scoped models
- `apps/web` — Next.js App Router, TypeScript, Tailwind CSS, responsive product shell
- PostgreSQL, Redis, Celery, and both applications run through Docker Compose
- Architecture decisions and the delivery roadmap live in `docs/`

## Start locally

1. Copy `.env.example` to `.env` and replace `SECRET_KEY`.
2. Run `docker compose up --build`.
3. Open the web app at http://localhost:3000 and API docs at http://localhost:8000/docs.

Apply migrations with:

```bash
docker compose exec api alembic upgrade head
```

## Current scope

This foundation implements the company/user identity boundary, secure browser sessions, registration and login, rotating refresh tokens, role-based authorization, tenant-safe data model conventions, health endpoints, background-worker wiring, and the initial operator dashboard shell. Customer, job, scheduling, and technician workflows are the next vertical slices.
