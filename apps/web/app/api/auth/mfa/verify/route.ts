import { type NextRequest, NextResponse } from "next/server";

import { apiUrl, fetchApi, invalidOrigin, isSameOrigin, setSessionCookies, type TokenPair } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.mfa_session !== "string" || typeof payload.code !== "string") {
    return NextResponse.json({ error: "A verification code is required." }, { status: 400 });
  }

  const result = await fetchApi<TokenPair>(
    "/auth/mfa/verify",
    { body: JSON.stringify({ mfa_session: payload.mfa_session, code: payload.code }), headers: { "Content-Type": "application/json" }, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, result.data!);
  return response;
}