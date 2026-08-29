import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiError, apiUrl, invalidOrigin, isSameOrigin } from "@/lib/auth";

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

  try {
    const upstream = await fetch(apiUrl("/auth/mfa/enroll/confirm"), {
      body: JSON.stringify({ code: payload.code }),
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to reach the authentication service." }, { status: 503 });
  }
}