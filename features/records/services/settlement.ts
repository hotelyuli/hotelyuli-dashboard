import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { planSettlement, type LedgerEntry } from "@/features/records/logic/settlement";

export type SettlementSource = { type: "tour" | "accommodation"; id: string };

/** What the income row records when a payment is created. */
export type PaymentDetails = {
  amount: number;
  currency: "USD" | "CRC";
  paymentMethod: string;
  category: string;
  guestName: string;
  roomNumber: string | null;
  referenceNote: string | null;
};

type StoredEntry = LedgerEntry & PaymentDetails;

export type NewIncomeRow = PaymentDetails & {
  entryType: "payment" | "reversal";
  settlementSeq: number;
  reversesEntryId: string | null;
  reason: string | null;
};

/** Storage seam so the flow is unit-testable without a database. */
export type SettlementLedger = {
  load(source: SettlementSource): Promise<StoredEntry[]>;
  /** Returns the new row id, or null when a unique index rejected a concurrent duplicate. */
  insert(source: SettlementSource, row: NewIncomeRow): Promise<string | null>;
};

export type SettlementResult = { action: "none" | "paid" | "reversed"; incomeId: string | null };

export class SettlementError extends Error {}

export async function applySettlement(params: {
  ledger: SettlementLedger;
  source: SettlementSource;
  wantPaid: boolean;
  /** Required only when a payment has to be created. */
  payment?: PaymentDetails;
  /** Required only when a payment has to be reversed. */
  reason?: string;
}): Promise<SettlementResult> {
  const { ledger, source, wantPaid, payment } = params;
  const entries = await ledger.load(source);
  const plan = planSettlement(entries, wantPaid);

  if (plan.action === "none") return { action: "none", incomeId: null };

  if (plan.action === "pay") {
    if (!payment || !Number.isFinite(payment.amount) || payment.amount < 0) throw new SettlementError("AMOUNT_REQUIRED");
    if (!payment.paymentMethod.trim()) throw new SettlementError("METHOD_REQUIRED");
    const incomeId = await ledger.insert(source, { ...payment, entryType: "payment", settlementSeq: plan.settlementSeq, reversesEntryId: null, reason: null });
    return incomeId ? { action: "paid", incomeId } : { action: "none", incomeId: null };
  }

  const reason = params.reason?.trim();
  if (!reason) throw new SettlementError("REASON_REQUIRED");
  const original = entries.find((entry) => entry.id === plan.reversesEntryId);
  if (!original) throw new SettlementError("LEDGER_INCONSISTENT");
  const incomeId = await ledger.insert(source, {
    amount: original.amount,
    currency: original.currency,
    paymentMethod: original.paymentMethod,
    category: original.category,
    guestName: original.guestName,
    roomNumber: original.roomNumber,
    referenceNote: original.referenceNote,
    entryType: "reversal",
    settlementSeq: plan.settlementSeq,
    reversesEntryId: original.id,
    reason
  });
  return incomeId ? { action: "reversed", incomeId } : { action: "none", incomeId: null };
}

/** income_entries-backed ledger. Every row created here is also queued for the (not yet built) Sheets export. */
export function supabaseLedger(params: { supabase: SupabaseClient<Database>; hotelId: string; userId: string; operationDate: string }): SettlementLedger {
  const { supabase, hotelId, userId, operationDate } = params;
  return {
    async load(source) {
      const { data, error } = await supabase
        .from("income_entries")
        .select("id, entry_type, settlement_seq, reverses_entry_id, amount, currency, payment_method, category, guest_name, room_number, reference_note")
        .eq("hotel_id", hotelId)
        .eq("source_type", source.type)
        .eq("source_id", source.id);
      if (error) throw new SettlementError(`LEDGER_LOAD_FAILED: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: row.id,
        entryType: row.entry_type,
        settlementSeq: row.settlement_seq ?? 0,
        reversesEntryId: row.reverses_entry_id,
        amount: Number(row.amount),
        currency: row.currency,
        paymentMethod: row.payment_method,
        category: row.category,
        guestName: row.guest_name,
        roomNumber: row.room_number,
        referenceNote: row.reference_note
      }));
    },
    async insert(source, row) {
      const payload = {
        hotel_id: hotelId,
        operation_date: operationDate,
        room_number: row.roomNumber,
        guest_name: row.guestName,
        paid: true,
        category: row.category,
        amount: row.amount,
        currency: row.currency,
        payment_method: row.paymentMethod,
        reference_note: row.referenceNote,
        entry_type: row.entryType,
        source_type: source.type,
        source_id: source.id,
        settlement_seq: row.settlementSeq,
        reverses_entry_id: row.reversesEntryId,
        reason: row.reason,
        created_by: userId
      };
      const { data, error } = await supabase.from("income_entries").insert(payload).select("id").single();
      if (error?.code === "23505") return null;
      if (error || !data) throw new SettlementError(`INCOME_SAVE_FAILED: ${error?.message ?? "no row returned"}`);
      const { error: queueError } = await supabase.from("google_sheets_outbox").insert({ hotel_id: hotelId, entity_type: "income", entity_id: data.id, payload });
      if (queueError) throw new SettlementError(`QUEUE_FAILED: ${queueError.message}`);
      return data.id;
    }
  };
}
