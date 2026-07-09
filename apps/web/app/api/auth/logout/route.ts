import { type NextRequest, NextResponse } from "next/server";

import { REFRESH_COOKIE, apiUrl, clearSessionCookies, invalidOrigin, isSameOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    await fetch(apiUrl("/auth/logout"), {
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}

