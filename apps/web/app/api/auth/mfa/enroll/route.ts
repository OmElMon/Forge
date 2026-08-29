import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiError, apiUrl, invalidOrigin, isSameOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const upstream = await fetch(apiUrl("/auth/mfa/enroll"), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json(), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to reach the authentication service." }, { status: 503 });
  }
}