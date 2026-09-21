import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  fetchApi,
  setSessionCookies,
  type Principal,
  type TokenPair,
} from "@/lib/auth";
import { isUpstreamUnavailable, UPSTREAM_UNAVAILABLE_MESSAGE } from "@/lib/session-policy";

async function fetchPrincipal(accessToken: string) {
  return fetchApi<Principal>(
    "/auth/me",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    8000,
    0
  );
}

// The API could not be reached (cold start, paused database, network blip) or
// answered with a server error. That is not proof the session is invalid, so
// keep the cookies and let the client retry instead of signing the user out.
function upstreamUnavailable() {
  return NextResponse.json({ error: UPSTREAM_UNAVAILABLE_MESSAGE }, { status: 503 });
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const upstream = await fetchPrincipal(accessToken);
    if (upstream.ok && upstream.data) return NextResponse.json(upstream.data);
    if (isUpstreamUnavailable(upstream.status)) return upstreamUnavailable();
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    const refresh = await fetchApi<TokenPair>(
      "/auth/refresh",
      {
        body: JSON.stringify({ refresh_token: refreshToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      8000,
      0
    );
    if (refresh.ok && refresh.data) {
      const principal = await fetchPrincipal(refresh.data.access_token);
      if (principal.ok && principal.data) {
        const response = NextResponse.json(principal.data);
        setSessionCookies(response, refresh.data);
        return response;
      }
      if (isUpstreamUnavailable(principal.status)) return upstreamUnavailable();
    }
    if (isUpstreamUnavailable(refresh.status)) return upstreamUnavailable();
  }

  const response = NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  clearSessionCookies(response);
  return response;
}
