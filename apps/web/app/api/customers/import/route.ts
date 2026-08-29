import { type NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, apiError, apiUrl, invalidOrigin, isSameOrigin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const upstream = await fetch(apiUrl("/customers/import/template"), {
      cache: "no-store",
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
  } catch {
    return NextResponse.json({ error: "Unable to reach the customer service." }, { status: 503 });
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
    const upstream = await fetch(apiUrl("/customers/import"), {
      body: form,
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "POST",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: await apiError(upstream) }, { status: upstream.status });
    }
    return NextResponse.json(await upstream.json());
  } catch {
    return NextResponse.json({ error: "Unable to reach the customer service." }, { status: 503 });
  }
}