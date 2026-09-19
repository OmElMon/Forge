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

type FollowupTask = {
  id: string;
  title: string;
  status: "open" | "resolved";
  due_at: string | null;
};

export async function GET(request: NextRequest) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const query = status ? `?status=${encodeURIComponent(status)}` : "";

  const result = await fetchApi<FollowupTask[]>(`/followups${query}`, { headers }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}