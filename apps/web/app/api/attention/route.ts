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

type AttentionItem = {
  category: string;
  priority: "urgent" | "high" | "medium";
  title: string;
  description: string;
  action_label: string;
  action_href: string;
  source_type: "invoice" | "job";
  source_id: string;
  customer_id: string;
  customer_name: string;
  amount_cents: number;
  due_at: string | null;
  created_at: string;
};

type AttentionSummary = {
  revenue_at_risk_cents: number;
  open_estimate_cents: number;
  open_invoice_cents: number;
  overdue_invoice_count: number;
  unscheduled_job_count: number;
  unassigned_job_count: number;
  completed_uninvoiced_job_count: number;
  items: AttentionItem[];
};

export async function GET(request: NextRequest) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const limit = request.nextUrl.searchParams.get("limit");
  const path = limit ? `/attention?limit=${encodeURIComponent(limit)}` : "/attention";

  const result = await fetchApi<AttentionSummary>(path, { headers }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
