import { NextResponse, type NextRequest } from "next/server";
import { missingSheetsEnv, outboxDiagnostics, runSheetsExport } from "@/features/sheets/export";
import { createClient } from "@/lib/supabase/server";

// Flushes the Google Sheets outbox and returns the per-row result.
// Authorized by EITHER
//   - "Authorization: Bearer $CRON_SECRET" (Vercel Cron sends this; also for curl), OR
//   - a logged-in owner/manager session (open the URL in the browser while signed in).
// ?check=1 reports configuration + queue counts without sending anything.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function isManagerSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
    return Boolean(profile?.active && (profile.role === "owner" || profile.role === "manager"));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearerOk = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!bearerOk && !(await isManagerSession())) {
    return NextResponse.json({
      error: "unauthorized",
      hint: secret ? "Send Authorization: Bearer <CRON_SECRET>, or open this URL while signed in as owner/manager." : "CRON_SECRET is not set in this deployment (Vercel Cron cannot run). Open this URL while signed in as owner/manager."
    }, { status: 401 });
  }

  const missing = missingSheetsEnv();
  const cronSecretMissing = !secret;
  if (request.nextUrl.searchParams.get("check") === "1") {
    return NextResponse.json({ configured: missing.length === 0, missingEnv: missing, cronSecretMissing, outbox: await outboxDiagnostics() });
  }
  if (missing.length) {
    return NextResponse.json({ error: "SHEETS_NOT_CONFIGURED", missingEnv: missing, cronSecretMissing }, { status: 503 });
  }
  try {
    const result = await runSheetsExport();
    console.log(`[sheets] flush: claimed ${result.claimed}, sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}`);
    return NextResponse.json({ ...result, cronSecretMissing });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sheets] flush run failed: ${message}`);
    return NextResponse.json({ error: message, cronSecretMissing }, { status: 500 });
  }
}
