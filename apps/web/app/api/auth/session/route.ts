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

async function fetchPrincipal(accessToken: string) {
  return fetchApi<Principal>(
    "/auth/me",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    8000,
    0
  );
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const upstream = await fetchPrincipal(accessToken);
    if (upstream.ok && upstream.data) return NextResponse.json(upstream.data);
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
    }
  }

  const response = NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  clearSessionCookies(response);
  return response;
}
