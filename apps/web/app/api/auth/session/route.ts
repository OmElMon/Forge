import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  apiUrl,
  clearSessionCookies,
  setSessionCookies,
  type Principal,
  type TokenPair,
} from "@/lib/auth";

async function fetchPrincipal(accessToken: string) {
  return fetch(apiUrl("/auth/me"), {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const upstream = await fetchPrincipal(accessToken).catch(() => null);
    if (upstream?.ok) return NextResponse.json((await upstream.json()) as Principal);
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    const refresh = await fetch(apiUrl("/auth/refresh"), {
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => null);
    if (refresh?.ok) {
      const tokens = (await refresh.json()) as TokenPair;
      const principal = await fetchPrincipal(tokens.access_token).catch(() => null);
      if (principal?.ok) {
        const response = NextResponse.json((await principal.json()) as Principal);
        setSessionCookies(response, tokens);
        return response;
      }
    }
  }

  const response = NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  clearSessionCookies(response);
  return response;
}

