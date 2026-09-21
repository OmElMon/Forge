/**
 * Session policy for the web BFF route handlers (`/api/auth/session`,
 * `/api/auth/refresh`).
 *
 * The FastAPI backend is the single authority on whether a session is valid.
 * "The backend could not be reached", "the request timed out", and "the backend
 * returned a server error" are infrastructure conditions, not authentication
 * verdicts: they must never clear session cookies or bounce the user to /login.
 * Render cold starts and Supabase pauses are expected in this deployment, so
 * treating those as a logout would sign users out during ordinary availability
 * blips.
 *
 * Keep this module dependency-free and pure so it can be unit tested without a
 * running server (`pnpm test`).
 */

/**
 * `fetchApi` reports transport failures and timeouts as 503, and never as 0;
 * 0 is accepted here as well so a future caller cannot accidentally treat a
 * synthetic "unreachable" status as an auth verdict.
 */
export function isUpstreamUnavailable(status: number): boolean {
  return status === 0 || status >= 500;
}

/** Statuses that prove the presented credential itself was rejected. */
export function isAuthRejection(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

export const UPSTREAM_UNAVAILABLE_MESSAGE =
  "CrewPilot OS is still waking up the operations service. Wait a few seconds, then try again.";
