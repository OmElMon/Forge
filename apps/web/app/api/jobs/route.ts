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

type Job = {
  id: string;
  company_id: string;
  customer_id: string;
  technician_id: string | null;
  title: string;
  status: "new" | "scheduled" | "in_progress" | "completed" | "canceled";
  scheduled_start: string | null;
  amount_cents: number;
  technician_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const customerId = request.nextUrl.searchParams.get("customer_id");
  const path = customerId ? `/jobs?customer_id=${encodeURIComponent(customerId)}` : "/jobs";

  const result = await fetchApi<Job[]>(path, { headers }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.title !== "string" || typeof payload.customer_id !== "string") {
    return NextResponse.json({ error: "Job title and customer are required." }, { status: 400 });
  }

  const result = await fetchApi<Job>(
    "/jobs",
    { body: JSON.stringify(payload), headers, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
