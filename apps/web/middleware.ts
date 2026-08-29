import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  type TokenPair,
  apiUrl,
  clearSessionCookies,
  setSessionCookies,
} from "@/lib/auth";

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

// Auth guard for protected pages; returns a response with the request headers
// (including the CSP nonce) applied so downstream rendering can use it.
async function guarded(request: NextRequest, headers: Headers) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const me = await fetch(apiUrl("/auth/me"), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);
    if (me?.ok) return NextResponse.next({ request: { headers } });
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return loginRedirect(request);

  const refresh = await fetch(apiUrl("/auth/refresh"), {
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }).catch(() => null);
  if (!refresh?.ok) return loginRedirect(request);

  const response = NextResponse.next({ request: { headers } });
  setSessionCookies(response, (await refresh.json()) as TokenPair);
  return response;
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);

  const { pathname } = request.nextUrl;
  const response = pathname.startsWith("/dashboard") ? await guarded(request, headers) : NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
