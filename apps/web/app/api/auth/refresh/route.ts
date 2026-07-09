import { type NextRequest, NextResponse } from "next/server";

import {
  REFRESH_COOKIE,
  apiError,
  apiUrl,
  clearSessionCookies,
  invalidOrigin,
  isSameOrigin,
  setSessionCookies,
  type TokenPair,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: "No active session." }, { status: 401 });

  try {
    const upstream = await fetch(apiUrl("/auth/refresh"), {
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!upstream.ok) {
      const response = NextResponse.json({ error: await apiError(upstream) }, { status: 401 });
      clearSessionCookies(response);
      return response;
    }
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, (await upstream.json()) as TokenPair);
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to refresh the session." }, { status: 503 });
  }
}

