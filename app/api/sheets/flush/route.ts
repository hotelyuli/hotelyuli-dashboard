import { NextResponse, type NextRequest } from "next/server";
import { missingSheetsEnv, outboxDiagnostics, runSheetsExport } from "@/features/sheets/export";

// Flushes the Google Sheets outbox. Called by Vercel Cron (which sends
// "Authorization: Bearer $CRON_SECRET") or manually with the same header.
// ?check=1 reports configuration + queue counts without sending anything.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set in this deployment, so the flush route is disabled (and Vercel Cron cannot authenticate)" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const missing = missingSheetsEnv();
  if (request.nextUrl.searchParams.get("check") === "1") {
    return NextResponse.json({ configured: missing.length === 0, missingEnv: missing, outbox: await outboxDiagnostics() });
  }
  if (missing.length) {
    return NextResponse.json({ error: "SHEETS_NOT_CONFIGURED", missingEnv: missing }, { status: 503 });
  }
  try {
    return NextResponse.json(await runSheetsExport());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
