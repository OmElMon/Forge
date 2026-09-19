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

type AnalyticsSummary = {
  revenue: {
    total_cents: number;
    paid_cents: number;
    open_invoice_cents: number;
    open_estimate_cents: number;
  };
  jobs: {
    total: number;
    completed: number;
    open: number;
  };
  customers: {
    total: number;
    active: number;
  };
  conversion: {
    estimate_to_invoice_rate: number;
  };
};

export async function GET(request: NextRequest) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await fetchApi<AnalyticsSummary>("/analytics/summary", { headers }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
