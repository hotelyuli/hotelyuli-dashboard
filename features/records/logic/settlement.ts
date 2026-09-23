// Append-only settlement ledger for anything that can be marked paid (a tour
// booking, a room's accommodation balance). The linked income_entries rows are
// the source of truth: a source is "settled" while it has a payment entry that
// no reversal points at. Nothing is ever updated or deleted — un-paying adds a
// reversal entry referencing the payment it cancels.

export type LedgerEntry = {
  id: string;
  entryType: "payment" | "reversal";
  settlementSeq: number;
  reversesEntryId: string | null;
};

export type SettlementPlan =
  | { action: "none" }
  | { action: "pay"; settlementSeq: number }
  | { action: "reverse"; reversesEntryId: string; settlementSeq: number };

/** The payment currently in force for a source, or null when it is not settled. */
export function activePayment(entries: LedgerEntry[]): LedgerEntry | null {
  const reversed = new Set(entries.filter((entry) => entry.entryType === "reversal").map((entry) => entry.reversesEntryId));
  const open = entries.filter((entry) => entry.entryType === "payment" && !reversed.has(entry.id));
  return open.sort((a, b) => b.settlementSeq - a.settlementSeq)[0] ?? null;
}

/**
 * Idempotent: asking for the state the ledger is already in plans nothing, so
 * marking paid twice never creates a second income row. Re-paying after a
 * reversal opens the next settlement sequence number.
 */
export function planSettlement(entries: LedgerEntry[], wantPaid: boolean): SettlementPlan {
  const active = activePayment(entries);
  if (wantPaid) {
    if (active) return { action: "none" };
    const lastSeq = Math.max(0, ...entries.filter((entry) => entry.entryType === "payment").map((entry) => entry.settlementSeq));
    return { action: "pay", settlementSeq: lastSeq + 1 };
  }
  if (!active) return { action: "none" };
  return { action: "reverse", reversesEntryId: active.id, settlementSeq: active.settlementSeq };
}

export type IncomeForTotals = {
  amount: number | string;
  currency: "USD" | "CRC";
  paid: boolean;
  entryType?: "payment" | "reversal" | null;
};

/** Settled money only: unpaid entries are excluded and reversals subtract. USD and CRC never mix. */
export function settledTotals(entries: IncomeForTotals[]): { USD: number; CRC: number } {
  const totals = { USD: 0, CRC: 0 };
  for (const entry of entries) {
    if (!entry.paid) continue;
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) continue;
    totals[entry.currency] += entry.entryType === "reversal" ? -amount : amount;
  }
  return { USD: roundCents(totals.USD), CRC: roundCents(totals.CRC) };
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}
