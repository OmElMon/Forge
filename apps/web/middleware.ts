import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";

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

// Session cookies are never deleted here. Clearing a dead session is an explicit
// action (`DELETE /api/auth/session`) taken by the coordinator after its
// confirming probe, so a redirect can never race a valid tab's fresh cookies.
// This only fires when there is no session evidence at all, so there is nothing
// to clear anyway.
function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// Auth guard for protected pages.
//
// This deliberately makes no backend call and never rotates a refresh token.
// Refresh sessions are single-use, so a guard that renewed on every request
// would have several concurrent dashboard/prefetch requests rotating the same
// token at once — the losers would be rejected and the user could be signed out
// by their own traffic. Renewal now happens in exactly one place, the browser's
// single-flight session coordinator (`lib/session-client.ts`), and this guard
// only answers the cheap question "is there any session evidence at all?".
//
// The dashboard shell is a client-rendered app whose data always comes from
// authenticated /api calls, so nothing is exposed by deferring the real verdict
// to the API and to the coordinator.
function guarded(request: NextRequest, headers: Headers) {
  const hasSession =
    Boolean(request.cookies.get(ACCESS_COOKIE)?.value) ||
    Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
  if (!hasSession) return loginRedirect(request);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);

  const { pathname } = request.nextUrl;
  const response = pathname.startsWith("/dashboard")
    ? guarded(request, headers)
    : NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
