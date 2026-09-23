import { describe, expect, it } from "vitest";
import { buildIncomeSummary, formatMoney, methodGroup, type IncomeForSummary } from "@/features/records/logic/income-summary";
import { settledTotals } from "@/features/records/logic/settlement";

const entry = (overrides: Partial<IncomeForSummary>): IncomeForSummary => ({
  time: "10:00", category: "Accommodation", room: "Habitación 5", amount: 100, currency: "USD", method: "Visa", paid: true, entryType: "payment", reason: null, ...overrides
});

describe("daily income summary", () => {
  const entries = [
    entry({ amount: 150, method: "Visa" }),
    entry({ amount: 40, method: "Mastercard" }),
    entry({ amount: 30, method: "Cash USD", category: "Restaurant" }),
    entry({ amount: 5000, currency: "CRC", method: "Cash CRC", category: "Laundry" }),
    entry({ amount: 12500, currency: "CRC", method: "SINPE Móvil" }),
    entry({ amount: 20000, currency: "CRC", method: "Bank transfer" }),
    entry({ amount: 999, method: "Visa", paid: false }),
    entry({ time: "16:40", amount: 40, method: "Mastercard", entryType: "reversal", reason: "Cobro duplicado" })
  ];
  const summary = buildIncomeSummary(entries, "martes, 23 de septiembre de 2026");

  it("lists one line per method that has entries, with totals per currency", () => {
    expect(summary).toBe([
      "💰 HOTEL YULI", "Ingresos del día", "martes, 23 de septiembre de 2026", "",
      "Card: $150.00",
      "Cash USD: $30.00",
      "Cash CRC: CRC 5,000",
      "SINPE: CRC 12,500",
      "Transfer CRC: CRC 20,000",
      "",
      "TOTAL USD: $180.00",
      "TOTAL CRC: CRC 37,500",
      "",
      "Anulaciones / Reversals:",
      "- 16:40 · Accommodation · Habitación 5 · -$40.00 · Cobro duplicado"
    ].join("\n"));
  });

  it("counts settled money only, subtracts reversals and matches the page totals", () => {
    expect(summary).not.toContain("999");
    const page = settledTotals(entries.map((e) => ({ amount: e.amount, currency: e.currency, paid: e.paid, entryType: e.entryType })));
    expect(summary).toContain(`TOTAL USD: ${formatMoney("USD", page.USD)}`);
    expect(summary).toContain(`TOTAL CRC: ${formatMoney("CRC", page.CRC)}`);
  });

  it("never combines USD and CRC, even for the same method", () => {
    const mixed = buildIncomeSummary([entry({ amount: 10, method: "Visa" }), entry({ amount: 7000, currency: "CRC", method: "Visa" })], "hoy");
    expect(mixed).toContain("Card: $10.00");
    expect(mixed).toContain("Card CRC: CRC 7,000");
  });

  it("omits the reversals block when there are none and handles an empty day", () => {
    const empty = buildIncomeSummary([], "hoy");
    expect(empty).toContain("Sin ingresos cobrados.");
    expect(empty).toContain("TOTAL USD: $0.00");
    expect(empty).not.toContain("Anulaciones");
  });

  it("groups known methods and keeps unknown ones by name", () => {
    expect(methodGroup("Debit Mastercard")).toBe("Card");
    expect(methodGroup("Booking VCC")).toBe("OTA");
    expect(methodGroup("Agency")).toBe("Agency");
    expect(methodGroup("Cheque")).toBe("Cheque");
  });
});
