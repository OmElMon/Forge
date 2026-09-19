import { type NextRequest, NextResponse } from "next/server";

import { apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

type ResetCodeDelivery = {
  status: string;
  channel: string;
  code_valid_seconds: number;
  dev_code: string | null;
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const result = await fetchApi<ResetCodeDelivery>(
    "/auth/email-verify",
    { body: JSON.stringify({ email: payload.email }), headers: { "Content-Type": "application/json" }, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 202 });
}