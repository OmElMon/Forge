import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.code !== "string") {
    return NextResponse.json({ error: "A verification code is required." }, { status: 400 });
  }

  const result = await fetchApi<null>(
    "/auth/mfa/enroll/confirm",
    { body: JSON.stringify({ code: payload.code }), headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}