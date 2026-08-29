import { type NextRequest, NextResponse } from "next/server";

import { apiError, apiUrl, invalidOrigin, isSameOrigin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Invite token is required." }, { status: 400 });
  }

  try {
    const upstream = await fetch(apiUrl(`/invites/preview?token=${encodeURIComponent(token)}`), {
      cache: "no-store",
      method: "GET",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: "Unable to reach the invites service." }, { status: 503 });
  }
}