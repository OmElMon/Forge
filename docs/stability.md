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
