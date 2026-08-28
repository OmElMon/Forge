import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiError, apiUrl, invalidOrigin, isSameOrigin } from "@/lib/auth";

const allowedActions = new Set(["approve", "convert-to-invoice", "mark-paid", "send"]);

function authHeaders(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

type RouteContext = {
  params: Promise<{ action: string; id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { action, id } = await context.params;
  if (!allowedActions.has(action)) {
    return NextResponse.json({ error: "Unsupported invoice action." }, { status: 404 });
  }

  try {
    const upstream = await fetch(apiUrl(`/invoices/${id}/${action}`), {
      body: "{}",
      cache: "no-store",
      headers,
      method: "POST",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: "Unable to reach the invoice workflow service." }, { status: 503 });
  }
}