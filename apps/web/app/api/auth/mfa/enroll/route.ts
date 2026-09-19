import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

type MfaEnrollResult = {
  secret: string;
  uri: string;
  recovery_codes: string[];
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await fetchApi<MfaEnrollResult>(
    "/auth/mfa/enroll",
    { headers: { Authorization: `Bearer ${accessToken}` }, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}