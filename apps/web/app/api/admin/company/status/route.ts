import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

type AdminCompany = {
  id: string;
  name: string;
  status: string;
  billing_status: string;
  member_count: number;
  invite_count: number;
  audit_count: number;
  created_at: string;
  updated_at: string;
};

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.status !== "string") {
    return NextResponse.json({ error: "A workspace status is required." }, { status: 400 });
  }

  const result = await fetchApi<AdminCompany>(
    "/admin/company/status",
    { body: JSON.stringify({ status: payload.status }), headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, method: "PATCH" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}