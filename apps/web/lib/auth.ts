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

const LOCAL_API_URL = "http://127.0.0.1:8000/api/v1";
const PRODUCTION_API_URL = "https://crewpilotos.onrender.com/api/v1";
const PRODUCTION_WEB_HOST = "crewpilotos.netlify.app";

export function apiUrl(path: string) {
  const base =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "production" ? PRODUCTION_API_URL : LOCAL_API_URL);
  return `${base.replace(/\/$/, "")}${path}`;
}

export function isSameOrigin(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "none") return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    return originHost === request.nextUrl.host || originHost === PRODUCTION_WEB_HOST;
  } catch {
    return false;
  }
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

export const DEFAULT_API_TIMEOUT_MS = 10000;
export const IDEMPOTENT_MAX_RETRIES = 2;
export const IDEMPOTENT_RETRY_DELAY_MS = 500;

export async function fetchApiResponse(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(apiUrl(path), {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
  retries = 0
): Promise<{ ok: boolean; data: T | null; error: string | null; status: number }> {
  try {
    const response = await fetchApiResponse(path, options, timeoutMs);
    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      let error = "The request could not be completed.";
      if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") {
        error = data.detail;
      } else if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
        error = data.error;
      }
      return { ok: false, data: null, error, status: response.status };
    }
    return { ok: true, data, error: null, status: response.status };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const errorMessage = timedOut
      ? "CrewPilot OS is still waking up the operations service. Wait a few seconds, then try again."
      : "Unable to reach the operations service.";
    const method = options.method?.toUpperCase() ?? "GET";
    if (retries > 0 && (method === "GET" || method === "HEAD")) {
      await new Promise((resolve) => setTimeout(resolve, IDEMPOTENT_RETRY_DELAY_MS));
      return fetchApi<T>(path, options, timeoutMs, retries - 1);
    }
    return { ok: false, data: null, error: errorMessage, status: 503 };
  }
}
