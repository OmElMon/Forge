import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  apiUrl,
  fetchApi,
  invalidOrigin,
  isSameOrigin,
} from "@/lib/auth";

const allowedActions = new Set(["assign", "cancel", "complete", "schedule", "start"]);

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

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { action, id } = await context.params;
  if (!allowedActions.has(action)) {
    return NextResponse.json({ error: "Unsupported job action." }, { status: 404 });
  }

  const payload = await request.json().catch(() => ({}));
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Job action payload must be an object." }, { status: 400 });
  }

  const result = await fetchApi<Job>(
    `/jobs/${id}/${action}`,
    { body: JSON.stringify(payload), headers, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
