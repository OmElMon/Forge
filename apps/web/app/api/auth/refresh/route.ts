import { type NextRequest, NextResponse } from "next/server";

import {
  REFRESH_COOKIE,
  fetchApi,
  invalidOrigin,
  isSameOrigin,
  setSessionCookies,
  type TokenPair,
} from "@/lib/auth";

/**
 * The one endpoint that rotates a single-use refresh token.
 *
 * It is called only by the browser's single-flight session coordinator
 * (`lib/session-client.ts`), which shares one in-flight renewal across all
 * concurrent callers in a page and serializes across tabs with a Web Lock. Never
 * call this from several independent server-side code paths.
 *
 * Cookie ownership: this route only ever *writes* fresh cookies on success. It
 * never deletes cookies. A single rejected attempt does not prove the session is
 * dead — another tab may have rotated the shared token moments earlier, and its
 * fresh cookies are exactly what a delete here would destroy. The coordinator
 * resolves that ambiguity with a confirming `/api/auth/session` probe and clears
 * cookies explicitly (`DELETE /api/auth/session`) only once the session is
 * genuinely gone.
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
    // Rejection is reported as-is with the cookies left untouched, whether it is
    // a definitive 401 or a transient 429/5xx.
    return NextResponse.json(
      { error: result.error ?? "Unable to refresh the session." },
      { status: result.status }
    );
  }
  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, result.data);
  return response;
}
