import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/database.types";
import type { SeenRow } from "@/features/csv-import/logic/import-seen";
import { isMissingSchema } from "@/lib/db/schema-errors";

export type RetirementCandidate = {
  reservation_id: string; date: string; room: string; guest: string | null; reference: string | null;
  kind: "missing_from_import" | "moved_in_lh"; lh_room: string | null;
  /** Money recorded in YuliOS (income on the stay, or Pagado / Parcial set by hand): needs its own tick. */
  has_payment: boolean;
  /** Information only: the board says Pagado because Little Hotelier's balance is 0 (no income, no manual edit). */
  lh_paid: boolean;
  /** From a check-out file: LH may have extended the stay, the guest may still be in-house. */
  may_be_extended: boolean;
};
export type SkippedDate = { date: string; reason: "unresolved_room" | "too_old" };
export type RetirementResult =
  | { status: "none"; candidates: []; skipped_dates: SkippedDate[] }
  | { status: "needs_confirmation"; candidates: RetirementCandidate[]; skipped_dates: SkippedDate[] }
  | { status: "applied"; retired: number; flagged: number; candidates: RetirementCandidate[]; skipped_dates: SkippedDate[] }
  /** Not from the database: the file has lines that can't be read, so nothing was even checked. */
  | { status: "skipped_file"; invalid_rows: number; candidates: []; skipped_dates: [] };

/**
 * Reservations an import's file no longer lists for its dates (retire_missing_from_import, migration
 * 0032). Without `confirmIds` nothing changes: the result lists the candidates. With `confirmIds`
 * (the ids a person ticked) only those are retired / flagged. null = migration not applied.
 */
export async function retireMissingFromImport(
  supabase: SupabaseClient<Database>,
  params: { importId: string; fileType: "check_in" | "check_out"; seen: SeenRow[]; invalidRows: number; confirmIds?: string[] }
): Promise<RetirementResult | null> {
  if (params.invalidRows > 0) return { status: "skipped_file", invalid_rows: params.invalidRows, candidates: [], skipped_dates: [] };
  const { data, error } = await supabase.rpc("retire_missing_from_import", {
    p_import_id: params.importId, p_file_type: params.fileType, p_seen: params.seen as unknown as Json,
    p_confirm: Boolean(params.confirmIds), p_only: params.confirmIds ?? null
  });
  if (isMissingSchema(error)) return null;
  if (error) throw new Error(`RETIREMENT_FAILED: ${error.message}`);
  return data as unknown as RetirementResult;
}
