import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

const allowedActions = new Set(["cancel", "resend"]);

type RouteContext = {
  params: Promise<{ action: string; id: string }>;
};

type Invite = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
};

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { action, id } = await context.params;
  if (!allowedActions.has(action)) {
    return NextResponse.json({ error: "Unsupported invite action." }, { status: 404 });
  }

  const result = await fetchApi<Invite>(
    `/invites/${id}/${action}`,
    { body: "{}", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, method: "POST" },
    10000,
    0
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}