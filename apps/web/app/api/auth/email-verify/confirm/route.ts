import { type NextRequest, NextResponse } from "next/server";

import { apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.token !== "string") {
    return NextResponse.json({ error: "A verification code is required." }, { status: 400 });
  }

  const result = await fetchApi<null>(
    "/auth/email-verify/confirm",
    { body: JSON.stringify({ token: payload.token }), headers: { "Content-Type": "application/json" }, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}