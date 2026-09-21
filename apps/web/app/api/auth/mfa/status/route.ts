import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi } from "@/lib/auth";

// Mirrors the API's MfaStatus schema (`configured`/`confirmed`), which is what
// the settings card reads.
type MfaStatus = {
  configured: boolean;
  confirmed: boolean;
};

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await fetchApi<MfaStatus>("/auth/mfa", { headers: { Authorization: `Bearer ${accessToken}` } }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}