import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, fetchApi, type Principal } from "@/lib/auth";
import { isUpstreamUnavailable, UPSTREAM_UNAVAILABLE_MESSAGE } from "@/lib/session-policy";

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
 * - 200 principal      — the access token is valid.
 * - 401 unauthenticated — ask the coordinator to renew and retry.
 * - 503                — the backend is unreachable; the session is preserved.
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
    if (isUpstreamUnavailable(upstream.status)) {
      return NextResponse.json({ error: UPSTREAM_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
  }

  // An expired access cookie is an expected, recoverable state: the coordinator
  // renews it. Cookies stay untouched so the renewal still has a refresh token.
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}
