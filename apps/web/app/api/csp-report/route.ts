import { type NextRequest, NextResponse } from "next/server";

type CspReport = {
  "csp-report": {
    "blocked-uri": string;
    "disposition": string;
    "document-uri": string;
    "effective-directive": string;
    "original-policy": string;
    "referrer": string;
    "script-sample": string;
    "status-code": number;
    "violated-directive": string;
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CspReport;
    const report = body["csp-report"];

    if (report) {
      console.warn("[CSP Violation]", {
        directive: report["violated-directive"],
        blockedUri: report["blocked-uri"],
        documentUri: report["document-uri"],
        effectiveDirective: report["effective-directive"],
        statusCode: report["status-code"],
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}