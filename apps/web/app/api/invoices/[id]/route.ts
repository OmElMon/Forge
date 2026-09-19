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

type Invoice = {
  id: string;
  company_id: string;
  customer_id: string;
  document_type: "estimate" | "invoice";
  status: "draft" | "sent" | "approved" | "converted" | "paid" | "void";
  title: string;
  amount_cents: number;
  due_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await fetchApi<Invoice>(`/invoices/${id}`, { headers }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invoice update is required." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await fetchApi<Invoice>(
    `/invoices/${id}`,
    { body: JSON.stringify(payload), headers, method: "PATCH" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
