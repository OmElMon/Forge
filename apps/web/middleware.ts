import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  type TokenPair,
  clearSessionCookies,
  fetchApi,
  setSessionCookies,
  type Principal,
} from "@/lib/auth";
import {
  accessTokenNeedsRefresh,
  isAuthRejection,
  isUpstreamUnavailable,
  UPSTREAM_UNAVAILABLE_MESSAGE,
} from "@/lib/session-policy";

function buildCsp(nonce: string) {
  const upgradeInsecure = process.env.NODE_ENV === "production" ? "upgrade-insecure-requests; " : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `${upgradeInsecure}report-uri /api/csp-report`,
  ].join("; ");
}

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  const response = NextResponse.redirect(url);
  clearSessionCookies(response);
  return response;
}

async function refreshTokens(refreshToken: string) {
  return fetchApi<TokenPair>(
    "/auth/refresh",
    {
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    8000,
    0
  );
}

// Auth guard for protected pages; returns a response with the request headers
// (including the CSP nonce) applied so downstream rendering can use it.
async function guarded(request: NextRequest, headers: Headers) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const me = await fetchApi<Principal>(
      "/auth/me",
      { headers: { Authorization: `Bearer ${accessToken}` } },
      8000,
      0
    );
    if (me.ok) return NextResponse.next({ request: { headers } });
    // The backend is unreachable; that is not an authentication verdict, so let
    // the page render and surface its own connection error instead of logging
    // the user out during a cold start or a paused database.
    if (isUpstreamUnavailable(me.status)) return NextResponse.next({ request: { headers } });
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return loginRedirect(request);

  const refresh = await refreshTokens(refreshToken);
  if (refresh.ok && refresh.data) {
    const response = NextResponse.next({ request: { headers } });
    setSessionCookies(response, refresh.data);
    return response;
  }
  if (isUpstreamUnavailable(refresh.status)) return NextResponse.next({ request: { headers } });

  return loginRedirect(request);
}

// Data routes under /api are fetched directly by the dashboard with the access
// token cookie. Access tokens are short-lived (15 minutes), so a long-lived
// dashboard tab would otherwise start failing with raw 401s that only a manual
// page reload could clear. Refresh here, at the single choke point, and keep
// unauthenticated requests untouched so the route handlers still answer 401.
function cookieHeaderWithAccessToken(cookieHeader: string, accessToken: string) {
  const parts = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith(`${ACCESS_COOKIE}=`));
  parts.push(`${ACCESS_COOKIE}=${accessToken}`);
  return parts.join("; ");
}

async function withApiSession(request: NextRequest, headers: Headers) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.next({ request: { headers } });

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessTokenNeedsRefresh(accessToken, Date.now())) {
    return NextResponse.next({ request: { headers } });
  }

  const refresh = await refreshTokens(refreshToken);
  if (!refresh.ok || !refresh.data) {
    if (isUpstreamUnavailable(refresh.status)) {
      // Expired token plus an unreachable backend is an outage, not a logout:
      // answer with the retryable message instead of forwarding a request that
      // could only fail with a misleading 401.
      return NextResponse.json({ error: UPSTREAM_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    const response = NextResponse.next({ request: { headers } });
    if (isAuthRejection(refresh.status)) clearSessionCookies(response);
    return response;
  }

  // Forward the fresh access token to the route handler for *this* request as
  // well as storing it for the browser, so the retry does not have to fail once
  // before the new token takes effect.
  const forwardedHeaders = new Headers(headers);
  forwardedHeaders.set(
    "cookie",
    cookieHeaderWithAccessToken(request.headers.get("cookie") ?? "", refresh.data.access_token)
  );
  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  setSessionCookies(response, refresh.data);
  return response;
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);

  const { pathname } = request.nextUrl;
  let response: NextResponse;
  if (pathname.startsWith("/dashboard")) {
    response = await guarded(request, headers);
  } else if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/csp-report")) {
    response = await withApiSession(request, headers);
  } else {
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
