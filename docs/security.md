# Security baseline

- Passwords are hashed with Argon2 through `pwdlib`; plaintext credentials are never stored.
- Access tokens are short-lived. Refresh tokens rotate on use, and only their SHA-256 fingerprints are persisted.
- A token's `company_id` selects a tenant, but authorization revalidates the user-company membership from PostgreSQL on each authenticated request.
- Role checks are composed as FastAPI dependencies. Domain services must receive the resolved principal and derive tenant IDs from it.
- Tenant-owned tables require indexed, non-null company identifiers with foreign-key integrity.
- Audit records are append-oriented and retain actor, action, resource, tenant, and structured context.
- Secrets belong in the deployment secret manager or local `.env`, never source control.

Before production: add rate limiting, account lockout, password reset, email verification, MFA for privileged roles, CSRF-safe cookie sessions for the web client, strict security headers, S3 upload scanning, database row-level-security policies, and centralized security event monitoring.
