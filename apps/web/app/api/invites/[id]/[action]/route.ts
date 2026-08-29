import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiError, apiUrl, invalidOrigin, isSameOrigin } from "@/lib/auth";

const allowedActions = new Set(["cancel", "resend"]);

type RouteContext = {
  params: Promise<{ action: string; id: string }>;
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

  try {
    const upstream = await fetch(apiUrl(`/invites/${id}/${action}`), {
      body: "{}",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: "Unable to reach the invites service." }, { status: 503 });
  }
}