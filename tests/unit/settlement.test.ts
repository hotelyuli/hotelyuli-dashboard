import { describe, expect, it } from "vitest";
import { activePayment, planSettlement, settledTotals, type LedgerEntry } from "@/features/records/logic/settlement";
import { applySettlement, settleWithCorrection, type NewIncomeRow, type PaymentDetails, type SettlementLedger, type SettlementSource } from "@/features/records/services/settlement";

type Row = NewIncomeRow & { id: string; source: SettlementSource };

/** In-memory ledger that enforces the same unique indexes as migration 0019. */
function memoryLedger() {
  const rows: Row[] = [];
  const ledger: SettlementLedger = {
    async load(source) {
      return rows.filter((row) => row.source.type === source.type && row.source.id === source.id);
    },
    async insert(source, row) {
      const duplicateCycle = rows.some((r) => r.source.type === source.type && r.source.id === source.id && r.entryType === row.entryType && r.settlementSeq === row.settlementSeq);
      const duplicateReversal = row.reversesEntryId !== null && rows.some((r) => r.reversesEntryId === row.reversesEntryId);
      if (duplicateCycle || duplicateReversal) return null;
      const id = `income-${rows.length + 1}`;
      rows.push({ ...row, id, source });
      return id;
    }
  };
  return { ledger, rows };
}

const tour: SettlementSource = { type: "tour", id: "tour-1" };
const commission: PaymentDetails = { amount: 20, currency: "USD", paymentMethod: "Agency", category: "Tour commission", guestName: "Ana", roomNumber: "5", referenceNote: "Whale Watching" };

describe("applySettlement (paid -> income)", () => {
  it("creates exactly one income row when a tour is marked paid", async () => {
    const { ledger, rows } = memoryLedger();
    const result = await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    expect(result.action).toBe("paid");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entryType: "payment", amount: 20, currency: "USD", settlementSeq: 1, reversesEntryId: null });
  });

  it("marking paid twice still leaves one income row", async () => {
    const { ledger, rows } = memoryLedger();
    await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    const second = await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    expect(second.action).toBe("none");
    expect(rows).toHaveLength(1);
  });

  it("concurrent double click creates one row (unique index rejects the loser)", async () => {
    const { ledger, rows } = memoryLedger();
    const results = await Promise.all([
      applySettlement({ ledger, source: tour, wantPaid: true, payment: commission }),
      applySettlement({ ledger, source: tour, wantPaid: true, payment: commission })
    ]);
    expect(rows).toHaveLength(1);
    expect(results.map((r) => r.action).sort()).toEqual(["none", "paid"]);
  });

  it("refund keeps the original and adds a reversing row that references it", async () => {
    const { ledger, rows } = memoryLedger();
    const paid = await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    const refund = await applySettlement({ ledger, source: tour, wantPaid: false, reason: "Guest cancelled, refunded" });
    expect(refund.action).toBe("reversed");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: paid.incomeId, entryType: "payment" });
    expect(rows[1]).toMatchObject({ entryType: "reversal", reversesEntryId: paid.incomeId, amount: 20, currency: "USD", reason: "Guest cancelled, refunded" });
    expect(settledTotals(rows.map((r) => ({ amount: r.amount, currency: r.currency, paid: true, entryType: r.entryType })))).toEqual({ USD: 0, CRC: 0 });
  });

  it("requires a reason to reverse and writes nothing without one", async () => {
    const { ledger, rows } = memoryLedger();
    await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    await expect(applySettlement({ ledger, source: tour, wantPaid: false, reason: "  " })).rejects.toThrow("REASON_REQUIRED");
    expect(rows).toHaveLength(1);
  });

  it("un-paying twice creates only one reversal", async () => {
    const { ledger, rows } = memoryLedger();
    await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    await applySettlement({ ledger, source: tour, wantPaid: false, reason: "Void" });
    const again = await applySettlement({ ledger, source: tour, wantPaid: false, reason: "Void" });
    expect(again.action).toBe("none");
    expect(rows.filter((r) => r.entryType === "reversal")).toHaveLength(1);
  });

  it("re-paying after a refund opens a new settlement cycle", async () => {
    const { ledger, rows } = memoryLedger();
    await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    await applySettlement({ ledger, source: tour, wantPaid: false, reason: "Mistake" });
    const repaid = await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    expect(repaid.action).toBe("paid");
    expect(rows.map((r) => [r.entryType, r.settlementSeq])).toEqual([["payment", 1], ["reversal", 1], ["payment", 2]]);
  });

  it("un-paying something never paid does nothing and needs no reason", async () => {
    const { ledger, rows } = memoryLedger();
    const result = await applySettlement({ ledger, source: tour, wantPaid: false });
    expect(result.action).toBe("none");
    expect(rows).toHaveLength(0);
  });

  it("refuses to book a payment without amount or payment method", async () => {
    const { ledger, rows } = memoryLedger();
    await expect(applySettlement({ ledger, source: tour, wantPaid: true })).rejects.toThrow("AMOUNT_REQUIRED");
    await expect(applySettlement({ ledger, source: tour, wantPaid: true, payment: { ...commission, paymentMethod: "" } })).rejects.toThrow("METHOD_REQUIRED");
    expect(rows).toHaveLength(0);
  });

  it("keeps different sources independent", async () => {
    const { ledger, rows } = memoryLedger();
    await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    await applySettlement({ ledger, source: { type: "accommodation", id: "res-1" }, wantPaid: true, payment: { ...commission, amount: 150, category: "Accommodation", paymentMethod: "Visa" } });
    expect(rows).toHaveLength(2);
  });
});

describe("planSettlement / activePayment", () => {
  const payment = (id: string, seq: number): LedgerEntry => ({ id, entryType: "payment", settlementSeq: seq, reversesEntryId: null });
  const reversal = (id: string, of: string, seq: number): LedgerEntry => ({ id, entryType: "reversal", settlementSeq: seq, reversesEntryId: of });

  it("finds the unreversed payment", () => {
    expect(activePayment([payment("p1", 1), reversal("r1", "p1", 1), payment("p2", 2)])?.id).toBe("p2");
    expect(activePayment([payment("p1", 1), reversal("r1", "p1", 1)])).toBeNull();
  });

  it("plans the next sequence number after a reversal", () => {
    expect(planSettlement([payment("p1", 1), reversal("r1", "p1", 1)], true)).toEqual({ action: "pay", settlementSeq: 2 });
    expect(planSettlement([payment("p1", 1)], false)).toEqual({ action: "reverse", reversesEntryId: "p1", settlementSeq: 1 });
  });
});

describe("settledTotals (Income page totals)", () => {
  it("counts only paid entries, subtracts reversals, never mixes currencies", () => {
    expect(settledTotals([
      { amount: 100, currency: "USD", paid: true, entryType: "payment" },
      { amount: "50.5", currency: "USD", paid: false, entryType: "payment" },
      { amount: 20, currency: "USD", paid: true, entryType: "reversal" },
      { amount: 5000, currency: "CRC", paid: true },
      { amount: 999, currency: "CRC", paid: false }
    ])).toEqual({ USD: 80, CRC: 5000 });
  });
});

describe("settleWithCorrection (editing a paid tour)", () => {
  it("a changed commission on a paid tour appends a reversal + a new payment; nothing is rewritten", async () => {
    const { ledger, rows } = memoryLedger();
    await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    const result = await settleWithCorrection({ ledger, source: tour, wantPaid: true, payment: { ...commission, amount: 30 } });
    expect(result).toEqual({ action: "corrected", reversed: 20 });
    expect(rows.map((row) => [row.entryType, row.amount, row.settlementSeq, row.reversesEntryId])).toEqual([
      ["payment", 20, 1, null], ["reversal", 20, 1, "income-1"], ["payment", 30, 2, null]
    ]);
    expect(rows[1].reason).toBe("Corrección / Correction: USD 20.00 → USD 30.00");
    expect(settledTotals(rows.map((row) => ({ amount: row.amount, currency: row.currency, paid: true, entryType: row.entryType })))).toEqual({ USD: 30, CRC: 0 });
  });

  it("same amount: no income rows; not yet paid: a normal payment; leaving paid: a reversal with the reason", async () => {
    const { ledger, rows } = memoryLedger();
    expect((await settleWithCorrection({ ledger, source: tour, wantPaid: false, payment: commission })).action).toBe("none");
    expect((await settleWithCorrection({ ledger, source: tour, wantPaid: true, payment: commission })).action).toBe("paid");
    expect((await settleWithCorrection({ ledger, source: tour, wantPaid: true, payment: { ...commission, amount: 20.001 } })).action).toBe("none");
    expect((await settleWithCorrection({ ledger, source: tour, wantPaid: false, payment: commission, reason: "Tour cancelado" })).action).toBe("reversed");
    expect(rows.map((row) => row.entryType)).toEqual(["payment", "reversal"]);
    await expect(settleWithCorrection({ ledger, source: tour, wantPaid: true, payment: commission }).then(() => settleWithCorrection({ ledger, source: tour, wantPaid: false, payment: commission }))).rejects.toThrow("REASON_REQUIRED");
  });

  it("a retry after a failure between the two rows only adds the missing payment", async () => {
    const { ledger, rows } = memoryLedger();
    await applySettlement({ ledger, source: tour, wantPaid: true, payment: commission });
    await applySettlement({ ledger, source: tour, wantPaid: false, reason: "Corrección" }); // crashed right after the reversal
    await settleWithCorrection({ ledger, source: tour, wantPaid: true, payment: { ...commission, amount: 30 } });
    expect(rows.map((row) => [row.entryType, row.amount])).toEqual([["payment", 20], ["reversal", 20], ["payment", 30]]);
  });
});
