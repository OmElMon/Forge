import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi } from "@/lib/auth";

function authHeaders(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

type AuditLog = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  context: Record<string, unknown>;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const search = request.nextUrl.searchParams;
  const params = new URLSearchParams();
  for (const key of ["action", "resource_id", "resource_type", "limit"]) {
    const value = search.get(key);
    if (value) params.set(key, value);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";

  const result = await fetchApi<AuditLog[]>(`/audit-logs${query}`, { headers }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
