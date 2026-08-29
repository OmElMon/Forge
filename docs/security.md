# Security baseline

- Passwords are hashed with Argon2 through `pwdlib`; plaintext credentials are never stored.
- Access tokens are short-lived. Refresh tokens rotate on use, and only their SHA-256 fingerprints are persisted.
- The Next.js browser-facing layer keeps both tokens in `HttpOnly`, `SameSite=Lax` cookies. Tokens are never exposed to client JavaScript or browser storage.
- Protected routes revalidate access against `/auth/me`; expired access tokens are transparently rotated through the server-side refresh flow.
- A token's `company_id` selects a tenant, but authorization revalidates the user-company membership from PostgreSQL on each authenticated request.
- Role checks are composed as FastAPI dependencies. Domain services must receive the resolved principal and derive tenant IDs from it.
- Login lockout and per-IP rate limiting are enforced on the login endpoint. Failed attempts are counted per account email and per client IP; after `account_lockout_max_attempts` failures within `account_lockout_window_seconds` the account/IP is blocked for `account_lockout_duration_seconds` (429 + `Retry-After`), and the response is identical whether or not the email exists. The store follows `rate_limiter_backend` (in-process memory by default; Redis for shared multi-instance enforcement) and fails open if the store is unavailable. Frontal brute-force volume is additionally capped by the per-IP auth rate limit (30/min default).
- Every response carries hardened security headers set by `security_headers_middleware` (outermost middleware, so they appear even on 429/4xx paths): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and `Strict-Transport-Security` (max-age 180 days, includeSubDomains).
- Tenant-owned tables require indexed, non-null company identifiers with foreign-key integrity.
- Audit records are append-oriented and retain actor, action, resource, tenant, and structured context.
- Secrets belong in the deployment secret manager or local `.env`, never source control.

Before production: email verification, MFA for privileged roles, CSRF-aware audit of cookie-based mutation routes (mutation proxies already enforce same-origin), strict Content-Security-Policy for the Next.js host, S3 upload scanning (if file uploads ship), database row-level-security policies (considering Supabase), and centralized security event monitoring. Rate limiting, account lockout, password reset, and the hardened security-header set are done (login throttle, lockout, and headers are covered by tests).
