import { type NextRequest, NextResponse } from "next/server";

import {
  REFRESH_COOKIE,
  clearSessionCookies,
  fetchApi,
  invalidOrigin,
  isSameOrigin,
  setSessionCookies,
  type TokenPair,
} from "@/lib/auth";
import { isAuthRejection } from "@/lib/session-policy";

/**
 * The one endpoint that rotates a single-use refresh token.
 *
 * It is called only by the browser's single-flight session coordinator
 * (`lib/session-client.ts`), which shares one in-flight renewal across all
 * concurrent callers in a page and serializes across tabs with a Web Lock. Never
 * call this from several independent server-side code paths.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: "No active session." }, { status: 401 });

  const result = await fetchApi<TokenPair>(
    "/auth/refresh",
    {
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    8000,
    0
  );
  if (!result.ok || !result.data) {
    const response = NextResponse.json(
      { error: result.error ?? "Unable to refresh the session." },
      { status: result.status }
    );
    // Only a definitive rejection ends the session. A timeout or 5xx keeps the
    // cookies so the user is not signed out by an infrastructure blip.
    if (isAuthRejection(result.status)) clearSessionCookies(response);
    return response;
  }
  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, result.data);
  return response;
}
