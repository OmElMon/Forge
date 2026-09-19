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

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: "lead" | "active" | "inactive";
  source: string | null;
  preferred_contact: string;
  sms_opt_in: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerDetail = Customer & {
  lifetime_value_cents: number;
  paid_invoice_count: number;
  open_job_count: number;
  open_estimate_count: number;
  open_estimate_cents: number;
  open_invoice_count: number;
  open_invoice_cents: number;
  service_addresses: ServiceAddress[];
  equipment: Equipment[];
};

type ServiceAddress = {
  id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  notes: string | null;
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

export async function GET(request: NextRequest, context: RouteContext) {
  const headers = authHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await fetchApi<CustomerDetail>(`/customers/${id}`, { headers }, 10000, 2);
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
    return NextResponse.json({ error: "Customer update is required." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await fetchApi<Customer>(
    `/customers/${id}`,
    { body: JSON.stringify(payload), headers, method: "PATCH" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
