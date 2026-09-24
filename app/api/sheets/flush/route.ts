import { NextResponse, type NextRequest } from "next/server";
import { runSheetsExport, sheetsExportConfigured } from "@/features/sheets/export";

// Flushes the Google Sheets outbox. Called by Vercel Cron (which sends
// "Authorization: Bearer $CRON_SECRET") or manually with the same header.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sheetsExportConfigured()) {
    return NextResponse.json({ error: "SHEETS_NOT_CONFIGURED: set GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEETS_TOURS_ID, GOOGLE_SHEETS_INCOME_ID and SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  }
  try {
    return NextResponse.json(await runSheetsExport());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
