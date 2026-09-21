/**
 * Session policy shared by the Next.js middleware and the session route handler.
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

function decodeBase64Url(segment: string): string | null {
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
    const withPadding = padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "=");
    const binary = atob(withPadding);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * True when an access token is missing, unreadable, or at/behind its expiry
 * (minus a small clock-skew margin), i.e. the BFF should refresh before calling
 * the API. The signature is intentionally not verified here: this only decides
 * whether to attempt a refresh, and the API still cryptographically validates
 * every token it receives.
 */
export function accessTokenNeedsRefresh(
  token: string | undefined | null,
  nowMs: number,
  skewMs = 30_000
): boolean {
  if (!token) return true;
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return true;
  const decoded = decodeBase64Url(payloadSegment);
  if (!decoded) return true;
  try {
    const claims = JSON.parse(decoded) as { exp?: unknown };
    if (typeof claims.exp !== "number") return true;
    return claims.exp * 1000 - skewMs <= nowMs;
  } catch {
    return true;
  }
}

export const UPSTREAM_UNAVAILABLE_MESSAGE =
  "CrewPilot OS is still waking up the operations service. Wait a few seconds, then try again.";
