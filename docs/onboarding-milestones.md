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

Status: complete.

Goal: invite a small number of friendly testers without risky or confusing account behavior.

Needed slices:

1. First-run onboarding checklist
   - done: guides user through first customer/intake record, first job, first estimate/invoice, and follow-up review (live-data progress + completion state).
   - done: dashboard checklist card.

2. Invite/team basics
   - done: invite team member, assign role, resend/cancel invite, tenant-safe membership creation.

3. Account recovery basics
   - done: password reset request + single-use reset token lifecycle with expiry and one-time use;
   - done: email delivery boundary with local/dev fake (in-UI dev code when no provider is configured).

4. Production smoke routine
   - done: smoke workflow docs at `docs/operations.md`;
   - done: health/readiness/status checks (`/health`, `/ready`, `/status` + production-smoke workflow);
   - done: post-deploy checklist at `docs/operations.md`.

5. Demo/tester guardrails
   - done: workspace settings (company profile, service area, timezone, default trade, notification preferences);
   - done: no accidental cross-tenant reads — every list/detail endpoint filters `company_id == principal.company_id` on top of row-level security, with new tests for tenant-scoped principals, audit search, and workspace access;
   - done: no production seed — demo data comes only from the local-only `apps/api/app/scripts/seed_demo.py` script;
   - note: a visible "demo workspace" label is a product choice the founder should make once real tester accounts exist.

Acceptance criteria:

- A friendly tester can create an account and understand what to do next.
- The owner can recover access if they forget a password.
- The owner can invite at least one teammate.
- Production deployment has a repeatable sanity-check path.
- No secrets are committed.

### Level 3 — Pilot-business onboarding

Status: nearly ready — the code side ships; remaining items are founder-owned accounts (messaging provider, Sentry DSN, Supabase backup drill), not software.

Goal: onboard a real small service business where the app can handle light operational use.

Needed slices:

1. Business setup
   - done: company profile + workspace settings — name, timezone, service area, default trade/vertical, and notification preferences (`GET/PATCH /companies/me`, dashboard Settings page);
   - done: owner/admin can edit; other roles read-only.

2. Data durability
   - done: documented backup cadence, migration rollback posture, and Supabase pause/availability notes at `docs/operations.md`;
   - pending: restore drill in the real Supabase project (founder-owned, one manual run) plus a documented cadence to repeat it.

3. Monitoring and errors
   - done: request correlation IDs — every response carries `X-Request-ID` (reuses inbound values) and each access line logs `request_id=` alongside method/path/status/duration;
   - done: production smoke workflow documented and runnable (`.github/workflows/production-smoke.yml`, docs at `docs/operations.md`);
   - pending: centralized error reporting — wired per the phased plan in `docs/operations.md`, no-op until a real Sentry DSN is provided;
   - pending: uptime check or external monitor — pick an external service and point it at `/api/v1/ready` (or add a scheduled smoke trigger).

4. Provider activation
   - pending: real messaging adapter — the delivery port, `sms_opt_in` consent flag, and disabled-by-default behavior are in place; activating a provider account and setting `messaging_provider=...` is founder-owned;
   - pending: provider webhook validation once the provider is chosen;
   - done: disabled-by-default safety (no accidental sends until a provider is configured) and opt-in/consent handling in `followup_recipient`.

5. Workflow reliability
   - done: follow-up delivery idempotency (single `delivered_at` watermark + partial-unique `unique_key`) with tests that prove no double-delivery/no duplicate materialization;
   - done: job → invoice loop covered through API tests (invoice transition events, follow-up auto-resolution) and the invoices UI;
   - done: intake → customer → job loop covered through API tests and the intake UI (convert + job handoff);
   - done: audit trail covers core business actions (auth, invites, invoices, customers, company settings, admin suspension).

Acceptance criteria:

- A pilot business can use the app for real leads/customers/jobs/invoices with low manual rescue.
- Production failures are visible quickly.
- Follow-up automation can be explained, toggled, and audited.
- Backups are not theoretical; restore has been tested.

### Level 4 — Paid pilot / early revenue

Status: buildable code is in place for the support surface; charging money is gated on the founder connecting Stripe and on legal review.

Goal: charge a limited number of businesses for one focused workflow, not a broad all-in-one platform.

Needed slices:

- done: billing status stored on the company (`billing_status` column, default `free`) and surfaced in the owner-only admin card;
- done: owner-only admin/support surface (`GET /admin/company` overview with member/invite/audit counts, `PATCH /admin/company/status`);
- done: safe account suspension path — suspended workspaces block member logins and every member request (owner can still sign in to reactivate); full audit trail;
- done: audit/event search — `/audit-logs` filters by action, resource type/id, actor, and a free-text `q` that searches action/resource/context;
- done: one strong vertical workflow with measurable ROI — the job → send → paid loop plus dispatch confidence (the existing product wedge);
- pending: billing foundation with Stripe or equivalent (founder connects Stripe);
- pending: plan/subscription model + failed payment handling (build on the `billing_status` field once Stripe is connected);
- pending: real privacy/terms/data-deletion posture (legal review; the data model already supports tenant-scoped deletion).

Acceptance criteria:

- A paying pilot gets one measurable workflow improvement.
- The app can restrict access based on billing state.
- The founder can support accounts without database spelunking.

### Level 5 — Scalable launch

Status: gated on scaling infrastructure (Redis-based shared state, queue workers) and founder decisions, not on missing features.

Goal: expand beyond friendly/pilot users into a repeatable acquisition and onboarding motion.

Needed slices:

- done: timezone-aware company profiles (multiregion/market polish start);
- done: organization/team lifecycle basics — invitations with roles, memberships, and owner-only suspension/reactivation;
- done: finer per-slice RBAC — mutation endpoints are gated by workflow role groups (`require_roles` in `app/api/deps.py`): revenue/front-office mutations (customers + addresses + equipment + CSV import, intake create/update/convert, invoices + line items + all invoice lifecycle steps, follow-up resolution) allow owner/admin/office_staff; operations/dispatch mutations (jobs create/update/schedule/assign/start/complete/cancel, technicians create/update) allow owner/admin/dispatcher/office_staff; config mutations (follow-up procedure rules, company profile) allow owner/admin; reads stay open to every authenticated role, and technicians remain read-only in the dashboard;
- partial: provider abstraction hardening — clean port/adapter boundaries exist and stay no-op until providers are activated;
- partial: documentation and support workflows — `docs/operations.md` covers smoke, deploy, and recovery; expand as operational lessons land;
- partial: analytics for activation and retention — revenue/conversion/capacity analytics exist; activation funnel scripting is a product decision;
- done: durable shared rate limiting — `rate_limiter_backend` selects a Redis-backed `RedisFixedWindowLimiter` (shared counters across instances via atomic INCR + EXPIRE, fail-open on store errors, same 429/`Retry-After` contract), defaulting to in-process `memory` until more than one API instance runs;
- done: production hardening added login lockout and strict security headers — failed logins are counted per account email and per IP (`app/core/lockout.py`, memory or Redis store behind `rate_limiter_backend`, fail-open if the store errors), blocking for `account_lockout_duration_seconds` with a generic 429 reply that never reveals whether an email exists; every response carries `nosniff`/`DENY`/referrer/permissions/COOP/HSTS headers via the outermost `security_headers_middleware`, including on 429 and 4xx paths;
- done: email verification backend — single-use verification codes (`POST /auth/email-verify` + `/confirm`), delivered through the messaging port with a dev code when no provider is set, `users.email_verified` + `auth.email_verified` audit, and `/auth/me` surfacing the state; enforcement is opt-in via `EMAIL_VERIFICATION_REQUIRED` (off by default) so the pilot onboarding stays frictionless until launch;
- done: TOTP MFA for owner/admin — enrollment gated by `CONFIG_ROLES` with a provisioning URI and 8 BCrypt-hashed single-use recovery codes, confirmation requiring a live code before activation, disable requiring re-proof; confirmed users get a short-lived `mfa_session` challenge from `/auth/login` and finish via `/auth/mfa/verify` with a TOTP or recovery code, all of it audited under `auth.mfa.*`; the web-side enrollment page and login challenge step remain open;
- pending: production-grade worker queueing capacity verification (the follow-up sweep is already dedupe-safe across workers via `unique_key` + `delivered_at`; prove capacity once scaling infra is chosen);
- pending: load and concurrency testing once scaling infra is chosen;
- done: onboarding/import tools — customer CSV import (`POST /customers/import`, template at `GET /customers/import/template`) with row-level validation, per-row error reporting, in-file duplicate email/phone skipping, and event/audit coverage; the Customers dashboard page now has an upload card (file picker, template download, per-row error report, list refresh after import);
- pending: security review with a human reviewer (automated tests already cover auth, tokens, tenant scoping, and audit).

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
   - done: dedicated operations runbook at `docs/operations.md` —
   - smoke workflow docs — how to run `.github/workflows/production-smoke.yml`, what each step verifies, and how to interpret failures;
   - deploy checklist — ordered database → API → frontend preflight/verify/rollback steps;
   - error-reporting integration plan — phased FastAPI + Next.js capture, alerting, and guardrails; no-op until a real DSN is provided.

7. Levels 2–5 buildable sprint
   - done: workspace settings (`GET/PATCH /companies/me`) and the dashboard Settings page (profile, timezone, service area, default trade, notification preferences);
   - done: owner-only admin surface (`GET /admin/company`) and safe suspension path (`PATCH /admin/company/status`; suspended blocks member logins/requests, owner keeps reactivate rights; audit entries);
   - done: request correlation IDs (`X-Request-ID` header + `request_id=` access logs) and `/audit-logs` filters + text search;
   - done: `billing_status` field on companies for the future billing hook;
   - done: reliability/isolation verification — follow-up delivery idempotency, job→invoice and intake→customer→job loop coverage, tenant-scoped principal/audit tests.
   Next in order is the founder-gated queue in `docs/ai-handoff.md` (provider activation, Sentry, Stripe, restore drill).

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
