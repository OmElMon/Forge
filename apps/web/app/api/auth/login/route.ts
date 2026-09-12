import { type NextRequest, NextResponse } from "next/server";

import { apiError, apiUrl, invalidOrigin, isSameOrigin, setSessionCookies, type TokenPair } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const contentType = request.headers.get("content-type") ?? "";
  const wantsJson = request.headers.get("accept")?.includes("application/json") || contentType.includes("application/json");
  const payload = contentType.includes("application/json")
    ? await request.json().catch(() => null)
    : Object.fromEntries((await request.formData().catch(() => new FormData())).entries());

  function failure(error: string, status = 400) {
    if (wantsJson) return NextResponse.json({ error }, { status });
    const url = new URL("/login", request.url);
    url.searchParams.set("error", error);
    return NextResponse.redirect(url, { status: 303 });
  }

  if (!payload || typeof payload.email !== "string" || typeof payload.password !== "string") {
    return failure("Email and password are required.");
  }

  const email = payload.email.trim().toLowerCase();
  if (!email || !payload.password) {
    return failure("Email and password are required.");
  }

  try {
    const upstream = await fetch(apiUrl("/auth/login"), {
      body: JSON.stringify({ email, password: payload.password }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!upstream.ok) {
      return failure(await apiError(upstream), upstream.status);
    }
    const result = (await upstream.json()) as TokenPair & { mfa_required?: boolean; mfa_session?: string };
    if (result.mfa_required) {
      if (!wantsJson) return failure("Two-factor authentication requires the interactive sign-in form.", 403);
      return NextResponse.json({ mfa_required: true, mfa_session: result.mfa_session ?? null });
    }
    const response = wantsJson ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
    setSessionCookies(response, result);
    return response;
  } catch {
    return failure("Unable to reach the authentication service.", 503);
  }
}
