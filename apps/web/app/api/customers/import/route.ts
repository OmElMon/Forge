import { type NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  apiError,
  fetchApiResponse,
  invalidOrigin,
  isSameOrigin,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const upstream = await fetchApiResponse("/customers/import/template", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    const contentDisposition = upstream.headers.get("content-disposition");
    return new Response(await upstream.text(), {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/csv",
        ...(contentDisposition ? { "Content-Disposition": contentDisposition } : {}),
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "The customer service took too long to respond. Try again."
          : "Unable to reach the customer service.",
      },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return invalidOrigin();

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form || !form.get("file")) {
    return NextResponse.json({ error: "Attach a CSV file to import." }, { status: 400 });
  }

  try {
    const upstream = await fetchApiResponse("/customers/import", {
      body: form,
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "The customer import took too long. Check the customer list before trying again."
          : "Unable to reach the customer service.",
      },
      { status: 503 }
    );
  }
}
