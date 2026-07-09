import { type NextRequest, NextResponse } from "next/server";

import { apiError, apiUrl, invalidOrigin, isSameOrigin, setSessionCookies, type TokenPair } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.email !== "string" || typeof payload.password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const upstream = await fetch(apiUrl("/auth/login"), {
      body: JSON.stringify({ email: payload.email, password: payload.password }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, (await upstream.json()) as TokenPair);
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to reach the authentication service." }, { status: 503 });
  }
}

