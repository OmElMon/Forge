import { type NextRequest, NextResponse } from "next/server";

import {
  fetchApi,
  invalidOrigin,
  isSameOrigin,
  setSessionCookies,
  type TokenPair,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const payload = await request.json().catch(() => null);
  if (
    !payload ||
    typeof payload.company_name !== "string" ||
    typeof payload.full_name !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.password !== "string"
  ) {
    return NextResponse.json({ error: "All registration fields are required." }, { status: 400 });
  }

  const result = await fetchApi<TokenPair>(
    "/auth/register",
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    10000,
    0
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "The registration service returned an invalid response." },
      { status: result.status }
    );
  }
  const response = NextResponse.json({ ok: true }, { status: 201 });
  setSessionCookies(response, result.data);
  return response;
}
