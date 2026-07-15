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

Once the backend URL is live, set Netlify's `API_INTERNAL_URL`, redeploy the frontend, and login/register will point at the production API.
