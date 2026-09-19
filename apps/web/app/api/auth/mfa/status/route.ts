import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi } from "@/lib/auth";

type MfaStatus = {
  enrolled: boolean;
  confirmed: boolean;
  pending: boolean;
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