# CrewPilot OS onboarding milestones

This file turns the current product state into a practical build path for Codex or any other AI coding assistant.

Read this together with:

- `docs/ai-handoff.md`
- `docs/workflows.md`
- `docs/stability.md`
- `docs/security.md`

Do not add secrets, private customer data, provider credentials, or sensitive strategy notes to this file.

## Current readiness level

CrewPilot OS is currently an internal alpha / technical MVP.

It is strong enough for portfolio demos, recruiter/dev conversations, architecture review, friendly tester walkthroughs, and continued product development.

It is not ready for broad real-business onboarding yet because account recovery, onboarding polish, provider activation, production monitoring, and billing-grade reliability still need work.

## Target onboarding ladder

### Level 0 — Internal build system

Status: complete.

The project has a production-shaped foundation: FastAPI backend, Next.js frontend, PostgreSQL migrations, tenant-scoped data model, JWT auth and refresh sessions, GitHub CI, Render backend deployment, Supabase Postgres, Netlify-compatible frontend, and AI handoff docs.

Acceptance criteria:

- API tests pass.
- Web typecheck/build pass.
- GitHub Actions is green.
- `docs/ai-handoff.md` reflects the latest build state.

### Level 1 — Demo-ready SaaS MVP

Status: mostly complete.

Goal: a viewer can understand the product in one walkthrough without needing manual explanation for every screen.

Already built:

- workspace registration/login;
- CRM customers;
- customer profile depth;
- jobs and scheduling;
- technicians and workload signals;
- invoices and estimates;
- analytics;
- attention queue;
- follow-up taskboard;
- audit/activity timeline;
- dispatch suggestions;
- intake records backend + web UI (create/list/filter/edit/convert + job handoff);
- domain event stream;
- production health/status endpoints;
- rate limiting;
- backup/deploy tooling;
- integration-ready adapter boundaries.

Remaining work:

- ensure empty/loading/error states stay understandable as data grows;
- keep the invoice UI aligned with dedicated workflow endpoints instead of generic updates.

Acceptance criteria:

- A user can register, create a lead/intake record, convert it to a customer, create/schedule a job, create/send an estimate or invoice, and see follow-up/attention items update.
- The UI has no obvious dead-end pages.
- Demo data makes the product feel alive without requiring production secrets.

### Level 2 — Friendly tester onboarding

Status: next major target.

Goal: invite a small number of friendly testers without risky or confusing account behavior.

Needed slices:

1. First-run onboarding checklist
   - guide user through first customer/intake record;
   - create first job;
   - create first estimate/invoice;
   - review follow-ups.

2. Invite/team basics
   - invite team member;
   - assign role;
   - resend/cancel invite;
   - keep membership creation tenant-safe.

3. Account recovery basics
   - done: password reset request + single-use reset token lifecycle with expiry and one-time use;
   - email delivery boundary with local/dev fake (in-UI dev code when no provider is configured).

4. Production smoke routine
   - manual smoke test docs;
   - health/readiness/status checks;
   - basic post-deploy checklist.

5. Demo/tester guardrails
   - clear test-data labeling;
   - simple company settings;
   - no accidental cross-tenant reads;
   - no production seed unless explicitly allowed.

Acceptance criteria:

- A friendly tester can create an account and understand what to do next.
- The owner can recover access if they forget a password.
- The owner can invite at least one teammate.
- Production deployment has a repeatable sanity-check path.
- No secrets are committed.

### Level 3 — Pilot-business onboarding

Status: not ready yet.

Goal: onboard a real small service business where the app can handle light operational use.

Needed slices:

1. Business setup
   - company profile;
   - service area;
   - timezone;
   - default trade/vertical;
   - basic notification preferences.

2. Data durability
   - backup restore test;
   - documented backup cadence;
   - migration rollback posture;
   - production database pause/availability notes.

3. Monitoring and errors
   - centralized error reporting;
   - request correlation IDs surfaced in logs;
   - production smoke workflow documented and runnable;
   - uptime check or external monitor.

4. Provider activation
   - real messaging provider adapter;
   - provider webhook validation;
   - opt-in/consent handling for SMS;
   - disabled-by-default safety.

5. Workflow reliability
   - follow-up delivery idempotency;
   - job-to-invoice loop tested through API and UI;
   - intake-to-customer-to-job loop tested through API and UI;
   - audit trail covers important business actions.

Acceptance criteria:

- A pilot business can use the app for real leads/customers/jobs/invoices with low manual rescue.
- Production failures are visible quickly.
- Follow-up automation can be explained, toggled, and audited.
- Backups are not theoretical; restore has been tested.

### Level 4 — Paid pilot / early revenue

Status: future.

Goal: charge a limited number of businesses for one focused workflow, not a broad all-in-one platform.

Needed slices:

- billing foundation with Stripe or equivalent;
- plan/subscription model;
- billing status on company/account;
- failed payment handling;
- owner-only admin/support surface;
- audit/event search;
- safe account suspension path;
- one strong vertical workflow with measurable ROI;
- real privacy/terms/data-deletion posture.

Acceptance criteria:

- A paying pilot gets one measurable workflow improvement.
- The app can restrict access based on billing state.
- The founder can support accounts without database spelunking.

### Level 5 — Scalable launch

Status: future.

Goal: expand beyond friendly/pilot users into a repeatable acquisition and onboarding motion.

Needed slices:

- multi-region/market polish;
- provider abstraction hardening;
- stronger RBAC;
- organization/team lifecycle;
- analytics for activation and retention;
- security review;
- load and concurrency testing;
- production-grade queue/worker scaling;
- durable shared rate limiting;
- onboarding/import tools;
- documentation and support workflows.

Acceptance criteria:

- Onboarding is repeatable.
- Production operations are boring.
- The product can support multiple businesses without founder handholding.
- The app has a clear wedge and measurable ROI story.

## Current highest-priority build order

Use this order unless the user explicitly changes priorities.

1. Finish intake/lead flow
   - done: intake records are exposed in a web UI queue;
   - convert intake to customer (one click, emits events/audit);
   - job creation launch from converted customer (inline handoff form).

2. Fix invoice workflow UI gap
   - done: invoice transitions use dedicated workflow endpoints (`/api/invoices/[id]/[action]`);
   - convert estimate to invoice creates a draft invoice with line items copied and keeps the source estimate;
   - event/audit behavior consistent.
   Next in order is the first-run onboarding checklist.

3. First-run onboarding checklist
   - done: dashboard shows a progress checklist guiding new owners through first customer/intake record, first job, first estimate or invoice, and follow-up review;
   - steps complete from real data (customers/jobs/invoices) plus a reviewed flag when the owner opens the follow-up queue;
   - checklist shows a completion state once every setup step is done.
   Next in order is password reset.

4. Password reset
   - done: `POST /auth/password-reset` + `POST /auth/password-reset/confirm`;
   - hashed single-use token, 30-minute expiry, one-time use, resets revoke all refresh sessions + audit entry;
   - delivered through the messaging boundary (disabled/recording providers fall back to an in-UI dev code);
   - web flows: `/forgot-password` and `/reset-password` with a "Forgot password?" link on login.
   Next in order is team invite basics.

5. Team invite basics
   - done: owner/admin can invite a teammate with a role, expires outstanding invites for the same email, and the invite arrives as a single-use email link (fingerprint-only token, 7-day expiry);
   - done: `GET/POST /invites`, `POST /invites/{id}/cancel`, `POST /invites/{id}/resend`, `GET /memberships`, public `GET /invites/preview` + `POST /auth/invites/accept`;
   - done: accept creates the user + tenant-scoped membership in one step (or just adds the membership for an existing active user), issues a login session, and writes `invite.*` audit entries;
   - done: role rules — owner invites any role; admin cannot invite owner/admin; technicians/office staff cannot send invites;
   - done: `dashboard/team` page (members + invites with resend/cancel) and public `accept-invite` page.
   Next in order is the production monitoring pass.

6. Production monitoring pass
   - smoke workflow docs;
   - deploy checklist;
   - error-reporting integration plan.

## LLM implementation rules

When an LLM works on this project:

- Start by reading `docs/ai-handoff.md`.
- Check `git status --short` before editing.
- Prefer one complete slice over many half-finished changes.
- Add tests for backend behavior.
- Keep tenant boundaries explicit.
- Emit audit/domain events for meaningful business actions.
- Do not commit secrets.
- Do not make provider/billing/account changes without user approval.
- Avoid frontend-heavy work if Netlify credits are tight, unless the user requests UI.
- Run local checks before pushing.
- Watch GitHub Actions after pushing.

## Suggested handoff format after each slice

Every AI session should end with:

- what shipped;
- files changed;
- tests/checks run;
- commit hash;
- CI status;
- whether Render/Netlify/Supabase need manual attention;
- next recommended slice.

## North star

The goal is not to build a generic CRM.

The goal is to build an operating system for home-service businesses where the software notices operational gaps and helps close them:

- missed lead;
- estimate not followed up;
- job not scheduled;
- technician not assigned;
- completed job not invoiced;
- invoice not paid;
- customer touchpoint not logged.

AI should eventually sit on top of this operational event system. The foundation must stay reliable, tenant-safe, and understandable before adding heavier automation.
