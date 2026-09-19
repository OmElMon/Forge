import { type NextRequest, NextResponse } from "next/server";

import {
  REFRESH_COOKIE,
  clearSessionCookies,
  fetchApi,
  invalidOrigin,
  isSameOrigin,
  setSessionCookies,
  type TokenPair,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: "No active session." }, { status: 401 });

  const result = await fetchApi<TokenPair>(
    "/auth/refresh",
    {
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    8000,
    0
  );
  if (!result.ok || !result.data) {
    const response = NextResponse.json(
      { error: result.error ?? "Unable to refresh the session." },
      { status: result.status }
    );
    if (result.status === 400 || result.status === 401 || result.status === 403) {
      clearSessionCookies(response);
    }
    return response;
  }
  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, result.data);
  return response;
}
