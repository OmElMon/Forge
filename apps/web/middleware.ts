import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  apiUrl,
  clearSessionCookies,
  setSessionCookies,
  type TokenPair,
} from "@/lib/auth";

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  const response = NextResponse.redirect(url);
  clearSessionCookies(response);
  return response;
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const me = await fetch(apiUrl("/auth/me"), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);
    if (me?.ok) return NextResponse.next();
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

  const response = NextResponse.next();
  setSessionCookies(response, (await refresh.json()) as TokenPair);
  return response;
}

export const config = { matcher: ["/dashboard/:path*"] };

