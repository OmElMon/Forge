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

type IntakeRecord = {
  id: string;
  kind: "lead" | "call";
  status: "new" | "contacted" | "closed" | "converted";
  name: string | null;
  phone: string | null;
  source: string | null;
};

export async function GET(request: NextRequest) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const kind = request.nextUrl.searchParams.get("kind");
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  const query = params.toString();
  const path = query ? `/intake?${query}` : "/intake";

  const result = await fetchApi<IntakeRecord[]>(path, { headers }, 10000, 2);
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
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Intake details are required." }, { status: 400 });
  }

  const result = await fetchApi<IntakeRecord>(
    "/intake",
    { body: JSON.stringify(payload), headers, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}