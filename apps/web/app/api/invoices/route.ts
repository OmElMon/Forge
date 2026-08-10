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

export async function GET(request: NextRequest) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const customerId = request.nextUrl.searchParams.get("customer_id");
  const path = customerId ? `/invoices?customer_id=${encodeURIComponent(customerId)}` : "/invoices";

  try {
    const upstream = await fetch(apiUrl(path), {
      cache: "no-store",
      headers,
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: "Unable to reach the invoice service." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.title !== "string" || typeof payload.customer_id !== "string") {
    return NextResponse.json({ error: "Invoice title and customer are required." }, { status: 400 });
  }

  try {
    const upstream = await fetch(apiUrl("/invoices"), {
      body: JSON.stringify(payload),
      cache: "no-store",
      headers,
      method: "POST",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json(), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to reach the invoice service." }, { status: 503 });
  }
}
