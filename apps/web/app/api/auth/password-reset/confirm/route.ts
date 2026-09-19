import { type NextRequest, NextResponse } from "next/server";

import { apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.token !== "string" || typeof payload.password !== "string") {
    return NextResponse.json({ error: "A reset code and new password are required." }, { status: 400 });
  }

  const result = await fetchApi<null>(
    "/auth/password-reset/confirm",
    { body: JSON.stringify({ token: payload.token, password: payload.password }), headers: { "Content-Type": "application/json" }, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}