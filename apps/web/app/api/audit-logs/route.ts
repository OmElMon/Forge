import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiError, apiUrl } from "@/lib/auth";

function authHeaders(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

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

  try {
    const upstream = await fetch(apiUrl(`/audit-logs${query}`), {
      cache: "no-store",
      headers,
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: "Unable to reach the audit service." }, { status: 503 });
  }
}
