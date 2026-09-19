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
  params: Promise<{ id: string; equipmentId: string }>;
};

type Equipment = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  installed_at: string | null;
  notes: string | null;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Equipment update is required." }, { status: 400 });
  }

  const { id, equipmentId } = await context.params;
  const result = await fetchApi<Equipment>(
    `/customers/${id}/equipment/${equipmentId}`,
    { body: JSON.stringify(payload), headers, method: "PATCH" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id, equipmentId } = await context.params;
  const result = await fetchApi<null>(
    `/customers/${id}/equipment/${equipmentId}`,
    { headers, method: "DELETE" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return new NextResponse(null, { status: 204 });
}