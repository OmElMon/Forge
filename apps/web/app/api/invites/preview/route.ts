import { type NextRequest, NextResponse } from "next/server";

import { apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

type InvitePreview = {
  company_name: string;
  role: string;
  expires_at: string;
};

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Invite token is required." }, { status: 400 });
  }

  const result = await fetchApi<InvitePreview>(`/invites/preview?token=${encodeURIComponent(token)}`, {}, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}