# CrewPilot OS build workflow

This project should move in small, complete vertical slices. Each slice should include database changes, API contracts, backend tests, frontend states, and deployment notes when needed.

## What Moe does manually

- Own product direction: choose the next slice and approve tradeoffs.
- Manage external accounts: GitHub, Netlify, Render, Postgres, Redis, Twilio, OpenAI, domains, billing, and permissions.
- Add production secrets in provider dashboards when they must stay private.
- Review deployed behavior in the browser before sharing a link publicly.
- Decide when a feature is good enough to show recruiters, customers, or collaborators.

## What Codex should do

- Implement code changes across API, web, migrations, tests, and docs.
- Keep changes small enough to review and ship.
- Run local checks before pushing.
- Push commits to GitHub when asked.
- Update docs when deployment or setup steps change.
- Diagnose deploy errors using logs, health endpoints, and reproducible tests.

## Default feature loop

1. Pick one slice from `docs/roadmap.md`.
2. Define the user outcome in one sentence.
3. Implement backend models, migration, schemas, endpoints, and tests.
4. Implement frontend screens, empty states, loading states, and error states.
5. Run local checks.
6. Push to GitHub.
7. Let GitHub Actions, Netlify, and Render deploy/validate.
8. Run a production smoke test.
9. Fix anything that fails before starting the next slice.

## Current automation

- GitHub Actions CI runs on pushes to `main` and pull requests.
- Netlify deploys the Next.js frontend from GitHub.
- Render deploys the FastAPI backend from GitHub.
- A manual production smoke-test workflow can verify the live frontend and API after deploys.

## Recommended next slice

Build the CRM core:

- customers
- contacts
- properties/service addresses
- jobs/service calls
- notes/activity timeline

This creates the business data layer needed before AI voice-agent work becomes useful.

