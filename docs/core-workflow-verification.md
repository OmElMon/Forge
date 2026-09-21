# Core workflow verification

Verification of the CrewPilot OS pilot workflow (`customer → scheduled job → invoice`)
against a production-like local stack. This document records what was executed, what
passed, and what remains unverified.

**Do not add secrets to this file.** It intentionally contains no passwords, tokens,
cookies, connection strings, or real customer data.

## Verdict

**READY TO MERGE.**

Every step of the core workflow completed and persisted across reloads, sign-out, and
re-authentication. Negative, security, session, and outage behaviour matched the
designed contract. All required validation commands passed. The only open items are
environment-bound and listed under [Not verified](#not-verified).

## Environment

| Item | Value |
| --- | --- |
| Date of run | 2026-09-21 (UTC) |
| Tested commit | `ba3195f8d79be4ac7ba080d57a61c1832c1f71e3` |
| Runtime code under test | identical to `1c703e3`; `ba3195f` changed only a test fixture |
| Branch | `main`, 8 commits ahead of `origin/main`, not pushed |
| Frontend | Next.js production build (`next build` → `next start`), local origin |
| Backend | FastAPI via `uvicorn`, local |
| Database | real PostgreSQL 16.2, ephemeral local instance |
| Migrations | `alembic upgrade head` applied; head `20260901_0022`, `current == head` |
| Node / Python | Node v24.19.0 / Python 3.14.7 |
| Data | disposable local test workspaces only; no production records touched |

Notes on the environment:

- Docker is not installed on this machine, so the database was a real PostgreSQL 16.2
  server extracted into a temporary directory rather than a container.
- API requests were driven through the Next.js BFF route handlers (the same path the
  browser uses), with a cookie store replayed explicitly because production cookies are
  `Secure` and cannot be replayed over plain HTTP by a standard cookie jar.
- Render/Netlify/Supabase were **not** used. See [Not verified](#not-verified).

## Core workflow results

Fresh workspace, owner role. Each step lists the HTTP method, route, and observed
status. "Refresh" means a full page reload (`GET /dashboard/...` returning 200) followed
by a re-fetch of the record.

| # | Step | Method + route | Status | Result |
| --- | --- | --- | --- | --- |
| 1 | Register owner workspace | `POST /api/auth/register` | 201 | Workspace + owner session created |
| 2 | Confirm owner and company | `GET /api/auth/session` | 200 | `full_name="Evidence Owner"`, `company_name="Evidence HVAC <stamp>"`, `role="owner"` |
| 3 | Create customer | `POST /api/customers` | 201 | Customer created, `status="lead"`, owned by the signed-in tenant |
| 4 | Refresh + persistence | `GET /dashboard/customers` → `GET /api/customers` | 200 / 200 | Customer present after reload (`rows=1`) |
| 5 | Create job linked to customer | `POST /api/jobs` | 201 | `job.customer_id == customer.id` |
| 6 | Schedule the job | `POST /api/jobs/{job_id}/schedule` | 200 | `status="scheduled"`, `scheduled_start` set |
| 7 | Refresh + persistence | `GET /dashboard/jobs` → `GET /api/jobs/{job_id}` | 200 / 200 | `status="scheduled"`, same `scheduled_start`, still linked to the customer |
| 8 | Create invoice linked to customer + job | `POST /api/invoices` | 201 | `invoice.customer_id == customer.id` and `invoice.job_id == job.id` |
| 9 | Refresh + persistence | `GET /dashboard/invoices` → `GET /api/invoices` | 200 / 200 | Invoice present after reload (`rows=1`) |
| 10 | Invoice lifecycle | `POST /api/invoices/{id}/send` → `POST /api/invoices/{id}/mark-paid` | 200 / 200 | `draft → sent → paid` |
| 11 | Sign out | `POST /api/auth/logout` → `GET /api/auth/session` | 200 / 401 | Session cookies cleared; session endpoint rejects |
| 12 | Sign back in | `POST /api/auth/login` | 200 | Same `user_id` and `company_id` |
| 13 | Final verification | `GET /api/customers`, `/api/jobs/{id}`, `/api/invoices` | 200 / 200 / 200 | Customer, scheduled job, and paid invoice all present and correctly related |

Step 13 relationships, verified after re-authentication:

- `job.customer_id == customer_id`
- `invoice.customer_id == customer_id`
- `invoice.job_id == job_id`
- every visible customer/job/invoice row carried the authenticated `company_id`
- the schedule (`status="scheduled"` + `scheduled_start`) survived sign-out/sign-in
- the invoice lifecycle state (`paid`, 24 500 cents) survived sign-out/sign-in

### Disposable test record IDs

Generated in the ephemeral local database for this run; no production data.

| Record | ID |
| --- | --- |
| company | `ace32ae0-888a-4487-9b71-fa5adbb97d4d` |
| owner user | `10dbae6b-5438-41a8-90a0-83b4fb206c8a` |
| customer | `041aca77-3b54-4495-8c68-ff75d858ffbd` |
| job | `d9488a63-a0a8-49c4-aad3-9ea531ad7f96` |
| invoice | `cc8cbb4d-0ffc-4e0c-a99c-db9c81b9f240` |
| scheduled start | `2026-09-23T02:51:59Z` |
| owner e-mail | synthetic `owner.evidence.<stamp>@example.com` |
| customer e-mail | synthetic `pilot.<stamp>@example.com` |

**Core workflow checks: 28/28 passed.**

## Negative and security results

| Area | Scenario | Observed | Result |
| --- | --- | --- | --- |
| Auth | Incorrect password | 401 `Invalid email or password`, no session cookie issued | Pass |
| Auth | Nonexistent account | 401 with a byte-identical message to the wrong-password case (no user enumeration) | Pass |
| Auth | Duplicate registration | 409 | Pass |
| Forms | Empty / one-character customer name, invalid customer e-mail, negative invoice amount | 422, no partial record written | Pass |
| Forms | Job without a customer | 400 `Job title and customer are required.` | Pass |
| Forms | Job with an unknown customer ID | 404 | Pass |
| Forms | Invoice with an unknown customer ID | 404 | Pass |
| Forms | Malformed JSON body | 400 | Pass |
| Forms | Rejected job payload | No partial row created (`before == after`) | Pass |
| Routing | Anonymous `GET /dashboard`, `/dashboard/customers`, `/dashboard/invoices` | 307 → `/login?next=…` | Pass |
| Session | Expired access token on a protected route | 401 from the BFF, **zero** server-side rotations, cookies preserved; one coordinator renewal ⇒ exactly `+1` `refresh_sessions` row; the read then succeeds | Pass |
| Session | Protected MFA route (`GET /api/auth/mfa/status`) with an expired token | Same recovery; payload matches the API contract `{configured, confirmed}` | Pass |
| Replay | `GET/HEAD/OPTIONS` | Retried at most once | Pass |
| Replay | `POST/PATCH/PUT/DELETE` (including MFA mutations, invoice actions, login, refresh) | Never replayed automatically | Pass |
| Duplicates | Duplicate `POST /api/customers` | Two customers created (both 201) — creation is intentionally not deduplicated by name | Documented |
| Duplicates | Duplicate `POST /api/invoices/{id}/mark-paid` | First 200, second 409 `Only open invoices can be marked paid.` | Pass |
| Duplicates | Duplicate `POST /api/jobs/{id}/schedule` | Re-schedules (200) and creates no duplicate job | Documented |
| Duplicates | Duplicate `POST /api/auth/register` | 409 | Pass |
| Outage | Backend API stopped | Data routes 503 in ~1.0 s (bounded, no hang); **session cookies preserved**; `/dashboard` still renders 200 (no forced logout) | Pass |
| Outage | Backend API restored | Same session resumes; no re-login required | Pass |
| Outage | Database stopped | Sanitized retryable 503 `The operations database is temporarily unavailable…`; no host/user/driver detail leaked; cookies preserved | Pass |
| Outage | Database restored | Data access resumes | Pass |
| Outage | Rate limit reached (auth limiter) | Probe sequence `[200, 200, 429]`; the 429 carries **no** `Set-Cookie`, triggers no rotation, and the user stays signed in | Pass |
| Tenant | Cross-tenant read/patch/action on customer, job, invoice, address, and line-item IDs (14 checks) | Every attempt 404; victim records unchanged; cross-tenant lists leak nothing | Pass |
| Tenant | Empty workspace | All lists `[]`; dashboard renders | Pass |
| Session | Logout | `POST /api/auth/logout` 200; local cookies cleared; `/api/auth/session` 401 | Pass |
| Rotation | Replay of a rotated refresh token | Rejected 401 while the successor keeps working | Pass |
| Rotation | Concurrent refresh burst (6 parallel requests, expired access token) | All 401, **zero** server-side rotations, cookies kept; one renewal ⇒ exactly `+1` rotation | Pass |
| CSRF | Cross-origin `POST` (with and without `Sec-Fetch-Site`) | 403, nothing persisted | Pass |
| CSRF | Cross-origin `DELETE /api/auth/session` | 403 `Invalid request origin.` | Pass |
| Cookie ownership | Losing tab's rejected refresh applied to the shared jar | Emits **no** `Set-Cookie` at all; the winning tab's fresh cookies survive; the confirming probe returns 200 | Pass |

### Duplicate-submission behaviour (documented, not a defect)

- **Customer creation** is intentionally not deduplicated: two identical `POST /api/customers`
  calls create two records (201/201). The dashboard disables the submit button while a
  request is in flight, so a double-click cannot produce this.
- **State transitions** are guarded server-side (`mark-paid` twice → 409; `void` on a paid
  invoice → 409).
- **Scheduling** is an idempotent update: repeating it re-schedules the same job and never
  creates a second job.

## Commands and totals

### Web (`apps/web`)

| Command | Result |
| --- | --- |
| `pnpm test` | **56 passed**, 0 failed |
| `pnpm typecheck` | clean (`tsc --noEmit`) |
| `pnpm build` | compiled successfully; middleware 34.2 kB |

### API (`apps/api`)

| Command | Result |
| --- | --- |
| `.venv/bin/ruff check .` | All checks passed |
| `.venv/bin/ruff format --check .` | 160 files already formatted |
| `.venv/bin/pytest -q` | **287 passed** |
| `.venv/bin/alembic upgrade head --sql` | exit 0, 610 lines |

### Live verification phases

| Phase | Checks |
| --- | --- |
| Core workflow evidence (13 steps) | 28/28 |
| Adversarial / security | 38/38 |
| Cookie ownership | 8/8 |
| Session concurrency and rotation | 12/12 |
| Protected MFA routes | 9/9 |
| Backend outage / recovery | 5/5 and 2/2 |
| Database outage / recovery | 4/4 and 1/1 |
| Rate limiting | 5/5 |

### Repository

| Check | Result |
| --- | --- |
| `git diff --check` | clean |
| Secret scan of the full branch diff | no secret-like patterns |
| Tracked `.env` / credential files | none |
| `git status` | clean, `main` ahead of `origin/main` by 8 commits |

## Not verified

These require credentials, deployed services, or a real browser and were **not** exercised:

1. **A real browser.** The session coordinator, MFA settings card, and dashboard rendering
   were verified at the HTTP/BFF layer and through route-level tests that execute the real
   route handlers; no browser engine was used, so CSS/JS rendering, spinners, and
   click-driven flows are unconfirmed.
2. **Deployed Render / Netlify / Supabase.** Cold-start timing, the Supabase pooler URL,
   Netlify CORS origins, and live migration drift were not tested.
3. **MFA end-to-end.** Enrollment is unconfirmed with a real authenticator app; only the
   status read, the renewal path, and the no-replay rules were verified.
4. **Messaging delivery.** Password-reset, e-mail-verification, and invite e-mails use the
   disabled/dev-code provider; no real provider was contacted.
5. **Redis and Celery.** No Redis instance was available, so the Redis rate-limiter/lockout
   backends, the Celery worker, and the beat schedule were not exercised.
6. **CI.** No workflow run has executed for these commits (nothing has been pushed).
7. **Load/concurrency harness** (`apps/api/scripts/load_test.py`) was not run.

### Suggested manual production checklist after deploy

1. Run the **Production Smoke Test** workflow; confirm `/api/v1/status` reports
   `current == head` with `checks.database.status == "ok"`.
2. In a real browser, walk steps 1–13 above against the deployed stack.
3. Open two dashboard tabs, leave them idle past access-token expiry, then act in both:
   the second tab should recover silently instead of bouncing to `/login`.
4. Confirm the two-factor card loads on the Settings page for an owner account.
5. Confirm no unexpected 5xx in the Render logs during the walkthrough.
