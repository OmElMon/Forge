import { type NextRequest, NextResponse } from "next/server";

import {
  REFRESH_COOKIE,
  clearSessionCookies,
  fetchApi,
  invalidOrigin,
  isSameOrigin,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    await fetchApi<null>(
      "/auth/logout",
      {
        body: JSON.stringify({ refresh_token: refreshToken }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      5000,
      0
    );
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
