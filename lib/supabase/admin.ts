import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

/**
 * Service-role client for trusted server jobs only (the Google Sheets sender).
 * Bypasses RLS: never import from a Client Component or pass user input into it
 * without scoping.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("createAdminClient is server-only");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SHEETS_NOT_CONFIGURED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
