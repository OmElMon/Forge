import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi } from "@/lib/auth";

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

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await fetchApi<AdminCompany>(
    "/admin/company",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    10000,
    2
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}