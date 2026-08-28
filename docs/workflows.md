# CrewPilot OS build workflow

This is the standing build protocol for CrewPilot OS. It exists so a short prompt like “go ahead,” “continue the build,” or “run the workflow” is enough to keep shipping without re-litigating the plan every session.

The goal is simple: build CrewPilot OS into a credible vertical SaaS operating system for home-service businesses, one small validated slice at a time.

## Default operating mode

When Moe says to continue building, Codex should:

1. Read `docs/ai-handoff.md` and `docs/onboarding-milestones.md`, then check the current repo state and recent docs.
2. Pick the next highest-leverage slice from the build queue.
3. Prefer backend/API/platform work when Netlify credits are low or frontend auto-publishing is locked.
4. Keep the slice small enough to complete, test, commit, push, and explain clearly.
5. Avoid asking for confirmation unless a choice would materially change product direction, billing, secrets, external accounts, or production risk.
6. Run the relevant local checks.
7. Commit with a clear message.
8. Push to GitHub.
9. Watch GitHub Actions.
10. Report what shipped, what passed, and what should come next.

## Autopilot batch mode

When Moe says to “ramp the workflow,” “keep building,” or otherwise asks not to approve every stage, Codex should run in a bounded autopilot batch:

- Ship up to 2 small slices in one turn when they are low-risk and naturally connected.
- Stop after a failing check, production risk, unclear product decision, secret/billing requirement, or meaningful frontend deploy decision.
- Prefer code that advances the documented build queue over speculative rewrites.
- Keep commentary compact and focused on state changes.
- Do not burn external deploy credits intentionally; note frontend changes so Moe can decide when to publish.
- End with a clean repo, pushed commits, CI status, and the next recommended slice.

## Token-saving rules

To reduce repeated planning/token use:

- Do not restate the whole product vision unless asked.
- Read `docs/ai-handoff.md`, `docs/onboarding-milestones.md`, `docs/workflows.md`, `docs/roadmap.md`, and `docs/stability.md` first when direction is unclear.
- Make reasonable product assumptions inside the current stage.
- Prefer one complete slice over several half-finished branches.
- Keep user updates short: what is being built, whether it touches Netlify, whether tests passed.
- Use docs as memory instead of asking Moe to repeat context.

## Netlify credit-control policy

Netlify is the public frontend layer. Because credits can be limited:

- Backend-only stages are preferred by default while credits are tight.
- Frontend work is allowed when it materially improves product demo value.
- Do not rely on Netlify auto-publishing for every backend/API change.
- If frontend files change, say so clearly before the final handoff.
- Treat locked Netlify publishing as expected, not as a blocker.
- Manual Netlify deploys should happen only for meaningful UI/demo milestones.

## What Moe does manually

- Own product direction and approve major tradeoffs.
- Manage external accounts, billing, provider permissions, and production secrets.
- Add private environment variables in GitHub, Render, Netlify, Supabase, Twilio, OpenAI, Stripe, or other provider dashboards.
- Review deployed behavior in the browser before sharing links publicly.
- Decide when a feature is ready to show recruiters, customers, collaborators, or investors.

## What Codex should do

- Implement code changes across API, web, migrations, tests, and docs.
- Keep changes small enough to review and ship.
- Prefer tenant-scoped, production-shaped behavior over throwaway mock logic.
- Add tests for new backend behavior.
- Preserve secrets and private reports.
- Run local checks before pushing.
- Push commits to GitHub when asked or when continuing the established build workflow.
- Watch CI and fix failures before moving on.
- Update docs when deployment, setup, or product-stage assumptions change.

## Slice acceptance checklist

Every slice should aim for:

- Clear user outcome.
- Tenant-scoped data access.
- API contract or UI behavior as appropriate.
- Audit trail or event record when the action changes business state.
- Local validation.
- Passing GitHub Actions.
- Short handoff summary.

Not every slice needs a migration or UI. The slice should include only what is necessary to move the product forward safely.

## Build queue

### Current stage: workflow MVP / operations foundation

CrewPilot OS already has identity, tenancy, customers, jobs, technicians, invoices, attention queue, audit trail, Supabase-backed production database, Render API, and GitHub CI.

The next slices should strengthen the operating-system feel:

1. Dispatch workflow UI — expose schedule/assign/start/complete/cancel job actions in the dashboard.
2. Audit/activity timeline UI — show important customer/job/invoice events in context.
3. Customer profile depth — service addresses, contact notes, lifetime value, open work.
4. Technician availability — availability, off-day handling, workload signals.
5. Analytics foundation — revenue, open invoices, estimate conversion, completed jobs, average ticket.
6. Production observability — clearer health/status endpoints and smoke checks.
7. AI-ready events — normalize call intake/follow-up/workflow events before adding voice-agent automation.

### Later stages

After the workflow MVP feels dependable:

1. AI-assisted intake and follow-up.
2. Quote/invoice drafting assistance.
3. Missed-call and lead-response workflows.
4. Calendar/dispatch optimization.
5. Payments and accounting integrations.
6. Multi-market expansion polish.

## Default feature loop

1. Pick one slice from the build queue.
2. Define the user outcome in one sentence.
3. Implement the smallest useful backend and/or frontend change.
4. Add or update tests.
5. Run local checks.
6. Commit and push.
7. Watch GitHub Actions.
8. Note whether Render or Netlify need manual attention.
9. Stop with a clean repo and a crisp next-step recommendation.
