import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSheetsClient, parseServiceAccount } from "./google";
import { flushSheetsOutbox, MAX_ATTEMPTS, targetsFromEnv, type FlushResult, type OutboxItem, type OutboxStore } from "./flush";
import type { Cell, IncomeRecord, TourRecord } from "./rows";

type Admin = SupabaseClient<Database>;
const CLAIMABLE = (staleBefore: string) =>
  `status.eq.pending,and(status.eq.failed,attempt_count.lt.${MAX_ATTEMPTS}),and(status.eq.sending,claimed_at.lt."${staleBefore}")`;

/** google_sheets_outbox + source tables, read with the service-role client. */
export function supabaseOutboxStore(db: Admin): OutboxStore {
  return {
    async claim(limit) {
      const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: candidates, error } = await db.from("google_sheets_outbox").select("id").or(CLAIMABLE(staleBefore)).order("created_at").limit(limit);
      if (error) throw new Error(`OUTBOX_LOAD_FAILED: ${error.message}`);
      const claimed: OutboxItem[] = [];
      for (const candidate of candidates ?? []) {
        // Conditional update = claim: only one concurrent flush wins each item.
        const { data } = await db.from("google_sheets_outbox")
          .update({ status: "sending", claimed_at: new Date().toISOString() })
          .eq("id", candidate.id).or(CLAIMABLE(staleBefore))
          .select("id, entity_type, entity_id, attempt_count, sheet_range, sheet_values").maybeSingle();
        if (data) claimed.push({ ...data, sheet_values: (data.sheet_values as Cell[] | null) ?? null });
      }
      return claimed;
    },
    async loadTour(id) {
      const { data, error } = await db.from("tour_bookings").select("id, tour_date, operator_name, tour_name, guest_name, adults, children, total_price, commission_amount, currency, status, booked_by").eq("id", id).maybeSingle();
      if (error) throw new Error(`TOUR_LOAD_FAILED: ${error.message}`);
      return (data as TourRecord | null) ?? null;
    },
    async loadIncome(id) {
      const { data: income, error } = await db.from("income_entries").select("id, operation_date, category, amount, currency, payment_method, reference_note, guest_name, room_number, paid, entry_type, reason, source_type, source_id").eq("id", id).maybeSingle();
      if (error) throw new Error(`INCOME_LOAD_FAILED: ${error.message}`);
      if (!income) return null;
      let reservation: { booking_channel: string | null; arrival_date: string } | null = null;
      let boardChannel: string | null = null;
      if (income.source_type === "accommodation" && income.source_id) {
        // The ledger links a stay by reservation id, or by the board row when it had no reservation.
        const direct = await db.from("reservations").select("booking_channel, arrival_date").eq("id", income.source_id).maybeSingle();
        reservation = direct.data;
        if (!reservation) {
          const row = await db.from("daily_operations").select("reservation_id, booking_channel").eq("id", income.source_id).maybeSingle();
          boardChannel = row.data?.booking_channel ?? null;
          if (row.data?.reservation_id) reservation = (await db.from("reservations").select("booking_channel, arrival_date").eq("id", row.data.reservation_id).maybeSingle()).data;
        }
      }
      // Channel as stored (reservation first, else the one set on the board row); never the internal category.
      const bookingChannel = reservation?.booking_channel?.trim() || boardChannel?.trim() || null;
      return { income: income as IncomeRecord, enrichment: { bookingChannel, reservationDate: reservation?.arrival_date ?? null } };
    },
    async saveLocation(id, range, values) {
      const { error } = await db.from("google_sheets_outbox").update({ sheet_range: range, sheet_values: values as unknown as Json }).eq("id", id);
      if (error) throw new Error(`OUTBOX_SAVE_FAILED: ${error.message}`);
    },
    async markSent(id) {
      // Only if still ours: a tour re-queued mid-send stays pending and goes again.
      await db.from("google_sheets_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null, claimed_at: null }).eq("id", id).eq("status", "sending");
    },
    async markSkipped(id, reason) {
      await db.from("google_sheets_outbox").update({ status: "skipped", last_error: reason, claimed_at: null }).eq("id", id);
    },
    async markFailed(id, error, attempts) {
      await db.from("google_sheets_outbox").update({ status: "failed", last_error: error.slice(0, 1000), attempt_count: attempts, claimed_at: null }).eq("id", id).eq("status", "sending");
    }
  };
}

/** Whether the export is configured; without it, entries simply stay queued. */
export function sheetsExportConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_SHEETS_TOURS_ID && env.GOOGLE_SHEETS_INCOME_ID && env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function runSheetsExport(): Promise<FlushResult> {
  return flushSheetsOutbox({
    store: supabaseOutboxStore(createAdminClient()),
    sheets: createSheetsClient(parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)),
    targets: targetsFromEnv()
  });
}

/** Fire-and-forget flush right after a save (called inside next/server `after`). Never throws. */
export async function flushSheetsSoon(): Promise<void> {
  if (!sheetsExportConfigured()) return;
  try {
    const result = await runSheetsExport();
    if (result.failed) console.error(`[sheets] ${result.failed} item(s) failed: ${result.errors.join(" | ")}`);
  } catch (error) {
    console.error(`[sheets] export run failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
