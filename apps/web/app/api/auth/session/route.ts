import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  clearSessionCookies,
  fetchApi,
  invalidOrigin,
  isSameOrigin,
  type Principal,
} from "@/lib/auth";
import {
  isRetryableStatus,
  RATE_LIMITED_MESSAGE,
  UPSTREAM_UNAVAILABLE_MESSAGE,
} from "@/lib/session-policy";

/**
 * Read-only session probe.
 *
 * This route intentionally does NOT rotate the refresh token and never clears
 * cookies. Refresh sessions are single-use: if this endpoint (which every page
 * and the app shell call on mount) renewed the session, concurrent mounts would
 * rotate the same token several times over. Renewal belongs to the browser's
 * single-flight coordinator in `lib/session-client.ts`, which calls
 * `/api/auth/refresh` once; this route only reports what the access cookie can
 * prove right now.
 *
 * - 200 principal       — the access token is valid.
 * - 401 unauthenticated — ask the coordinator to renew and retry.
 * - 429 / 503           — retryable; the session is preserved. A rate-limited or
 *                         waking backend is not proof that the user signed out.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const upstream = await fetchApi<Principal>(
      "/auth/me",
      { headers: { Authorization: `Bearer ${accessToken}` } },
      8000,
      0
    );
    if (upstream.ok && upstream.data) return NextResponse.json(upstream.data);
    if (isRetryableStatus(upstream.status)) return retryable(upstream.status);
  }

  // An expired access cookie is an expected, recoverable state: the coordinator
  // renews it. Cookies stay untouched so the renewal still has a refresh token.
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}

/**
 * Explicitly end the *local* session by clearing the session cookies.
 *
 * This is the only endpoint that deletes session cookies, and the coordinator
 * calls it only after the confirming probe has established that the session is
 * genuinely dead. Clearing deliberately here means signing out never depends on
 * the side effect of navigating to `/login`.
 *
 * It deliberately does not call the backend: the session is already rejected, so
 * there is nothing left to revoke, and a network round trip here could keep a
 * dead session's cookies alive.
 */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}

// A rate-limited or unreachable backend stays retryable. Cookies are untouched:
// neither condition is evidence that the session is invalid.
function retryable(status: number) {
  if (status === 429) {
    return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });
  }
  return NextResponse.json({ error: UPSTREAM_UNAVAILABLE_MESSAGE }, { status: 503 });
}
