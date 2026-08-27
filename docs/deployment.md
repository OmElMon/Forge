# Deployment

CrewPilot OS is split into two deployable services:

- `apps/web` — the Next.js frontend, deployable to Netlify.
- `apps/api` — the FastAPI backend, deployable to a Python service host such as Render, Railway, Fly.io, or DigitalOcean App Platform.

Netlify should only host the frontend. The API, PostgreSQL, and Redis need to be hosted separately.

## Netlify frontend

The repository includes a root `netlify.toml` so Netlify can build the web app from the monorepo automatically.
It also explicitly enables Netlify's Next.js runtime plugin so App Router routes, middleware, and route handlers deploy correctly.

Use these settings when importing the GitHub repository:

```txt
Base directory: apps/web
Build command: pnpm build
Publish directory: .next
```

Netlify build environment:

```txt
NODE_VERSION=22
PNPM_VERSION=11.7.0
NEXT_TELEMETRY_DISABLED=1
```

After the backend is deployed, add this Netlify environment variable:

```txt
API_INTERNAL_URL=https://your-api-host.example.com/api/v1
```

The Next.js app uses `API_INTERNAL_URL` from server-side route handlers and middleware to keep API tokens in HttpOnly browser cookies.

## Backend API

The backend needs:

- a Python web service running `apps/api`;
- PostgreSQL;
- Redis for worker/background-job support;
- a production `SECRET_KEY` with at least 32 random characters;
- CORS configured for the deployed Netlify domain.

Example backend environment values:

```txt
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
SECRET_KEY=replace-with-a-real-production-secret
CORS_ORIGINS=["https://your-netlify-site.netlify.app"]
```

Run Alembic migrations after provisioning the database:

```bash
alembic upgrade head
```

The API Docker image runs migrations automatically on container startup before launching Uvicorn.

## Render blueprint

The repo ships `render.yaml`, a Render Blueprint that declares three services against a managed Redis and the Supabase Postgres:

- `crewpilot-api` — the web service (Docker, migrations on boot).
- `crewpilot-worker` — the Celery worker (`automation.followup_sweep` et al.).
- `crewpilot-beat` — the Celery beat scheduler.
- `crewpilot-redis` — a Render-managed Redis instance.

`DATABASE_URL` and `SECRET_KEY` are `sync: false`, so you must set them in the service environment after the blueprint provisions services (Supabase pooler URL with the `postgresql+asyncpg://` driver; a `SECRET_KEY` of at least 32 random characters). Adjust `CORS_ORIGINS` to the live Netlify domain. The web service `docker-entrypoint.sh` runs `alembic upgrade head` on every boot, so the blueprint needs no explicit migration job.

## Backups

Logical backups are handled by `apps/api/scripts/backup_db.sh`. It reads `DATABASE_URL`, strips the async driver suffix, and pipes `pg_dump` into a timestamped `*.sql.gz` archive under `BACKUP_DIR` (default `./backups`), pruning archives older than `BACKUP_RETENTION` days (default 14). It verifies each archive is valid gzip. Supabase provides native point-in-time backups; this script is a complementary off-platform logical copy and works both against the local docker-compose Postgres and Supabase.

Run it inside the API container (it ships `pg_dump` via the base image) or locally with a `pg_dump` on `PATH`:

```bash
make db-backup            # inside docker compose
DATABASE_URL="postgresql://..." BACKUP_DIR=/var/backups ./apps/api/scripts/backup_db.sh
```

Schedule it off-platform (e.g. a cron/CI job) rather than inside the short-lived API container:

Once the backend URL is live, set Netlify's `API_INTERNAL_URL`, redeploy the frontend, and login/register will point at the production API.
