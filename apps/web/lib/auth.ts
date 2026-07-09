import { type NextRequest, NextResponse } from "next/server";

export const ACCESS_COOKIE = "forge_access";
export const REFRESH_COOKIE = "forge_refresh";

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
};

export type Principal = {
  user_id: string;
  company_id: string;
  email: string;
  full_name: string;
  company_name: string;
  role: "owner" | "admin" | "dispatcher" | "technician" | "office_staff";
};

export function apiUrl(path: string) {
  const base =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:8000/api/v1";
  return `${base.replace(/\/$/, "")}${path}`;
}

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function apiError(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail ?? "The request could not be completed.";
  } catch {
    return "The authentication service is unavailable.";
  }
}

export function setSessionCookies(response: NextResponse, tokens: TokenPair) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_COOKIE, tokens.access_token, {
    httpOnly: true,
    maxAge: tokens.expires_in,
    path: "/",
    sameSite: "lax",
    secure,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure,
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  response.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
}

export function invalidOrigin() {
  return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
}

