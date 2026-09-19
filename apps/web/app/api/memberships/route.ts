import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiUrl, fetchApi, invalidOrigin, isSameOrigin } from "@/lib/auth";

type Membership = {
  user_id: string;
  company_id: string;
  role: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
  };
};

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await fetchApi<Membership[]>("/memberships", { headers: { Authorization: `Bearer ${accessToken}` } }, 10000, 2);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}