import { type NextRequest, NextResponse } from "next/server";

import { apiError, apiUrl, invalidOrigin, isSameOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.token !== "string") {
    return NextResponse.json({ error: "A verification code is required." }, { status: 400 });
  }

  try {
    const upstream = await fetch(apiUrl("/auth/email-verify/confirm"), {
      body: JSON.stringify({ token: payload.token }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
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