import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  apiUrl,
  fetchApi,
  invalidOrigin,
  isSameOrigin,
} from "@/lib/auth";

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

type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await fetchApi<InvoiceLineItem[]>(`/invoices/${id}/line-items`, { headers }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.description !== "string") {
    return NextResponse.json({ error: "Line item description is required." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await fetchApi<InvoiceLineItem>(
    `/invoices/${id}/line-items`,
    { body: JSON.stringify(payload), headers, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
