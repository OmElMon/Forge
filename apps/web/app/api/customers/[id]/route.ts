import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiError, apiUrl, invalidOrigin, isSameOrigin } from "@/lib/auth";

function authHeaders(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const upstream = await fetch(apiUrl(`/customers/${id}`), {
      cache: "no-store",
      headers,
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: "Unable to reach the customer service." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Customer update is required." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const upstream = await fetch(apiUrl(`/customers/${id}`), {
      body: JSON.stringify(payload),
      cache: "no-store",
      headers,
      method: "PATCH",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: "Unable to reach the customer service." }, { status: 503 });
  }
}
