// Daily income summary for WhatsApp / Copy / Print. Settled (paid) money only,
// reversals subtract, USD and CRC are never combined or converted.

export type IncomeForSummary = {
  time: string;
  category: string;
  room: string | null;
  amount: number | string;
  currency: "USD" | "CRC";
  method: string;
  paid: boolean;
  entryType: "payment" | "reversal";
  reason: string | null;
};

/** Payment method -> summary group (names from PaymentMethodOptions). Unknown methods keep their own name. */
const METHOD_GROUP: Record<string, string> = {
  Visa: "Card", "Visa Credit": "Card", "Visa Debit": "Card", Mastercard: "Card", "Debit Mastercard": "Card", "American Express": "Card",
  "Cash USD": "Cash USD", "Cash CRC": "Cash CRC",
  SINPE: "SINPE", "SINPE Móvil": "SINPE",
  "Bank transfer": "Transfer",
  "Booking VCC": "OTA", "Expedia Collect": "OTA", HostelWorld: "OTA",
  PayPal: "Online", Tilopay: "Online",
  Agency: "Agency"
};
const GROUP_ORDER = ["Card", "Cash USD", "Cash CRC", "SINPE", "Transfer", "OTA", "Online", "Agency"];

export function methodGroup(method: string): string {
  return METHOD_GROUP[method.trim()] ?? method.trim();
}

export function formatMoney(currency: "USD" | "CRC", amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return currency === "USD"
    ? `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${sign}CRC ${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Group name shown for a currency: "Transfer" in colones reads "Transfer CRC"; cash groups already carry it. */
function lineLabel(group: string, currency: "USD" | "CRC") {
  if (group === "Cash USD" || group === "Cash CRC") return group;
  return currency === "CRC" && group !== "SINPE" ? `${group} CRC` : group;
}

export function buildIncomeSummary(entries: IncomeForSummary[], dateLabel: string): string {
  const settled = entries.filter((entry) => entry.paid);
  const byLine = new Map<string, { group: string; currency: "USD" | "CRC"; total: number }>();
  const totals = { USD: 0, CRC: 0 };
  for (const entry of settled) {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) continue;
    const signed = entry.entryType === "reversal" ? -amount : amount;
    const group = methodGroup(entry.method);
    const key = `${group}|${entry.currency}`;
    const line = byLine.get(key) ?? { group, currency: entry.currency, total: 0 };
    line.total += signed;
    byLine.set(key, line);
    totals[entry.currency] += signed;
  }
  const order = (group: string) => { const i = GROUP_ORDER.indexOf(group); return i < 0 ? GROUP_ORDER.length : i; };
  const lines = [...byLine.values()]
    .sort((a, b) => order(a.group) - order(b.group) || a.group.localeCompare(b.group) || (a.currency === "USD" ? -1 : 1))
    .map((line) => `${lineLabel(line.group, line.currency)}: ${formatMoney(line.currency, round(line.total))}`);

  const reversals = settled.filter((entry) => entry.entryType === "reversal").sort((a, b) => a.time.localeCompare(b.time));
  const message = [
    "💰 HOTEL YULI",
    "Ingresos del día",
    dateLabel,
    "",
    ...(lines.length ? lines : ["Sin ingresos cobrados."]),
    "",
    `TOTAL USD: ${formatMoney("USD", round(totals.USD))}`,
    `TOTAL CRC: ${formatMoney("CRC", round(totals.CRC))}`
  ];
  if (reversals.length) {
    message.push("", "Anulaciones / Reversals:", ...reversals.map((entry) => `- ${entry.time.slice(0, 5)} · ${entry.category}${entry.room ? ` · ${entry.room}` : ""} · ${formatMoney(entry.currency, -Number(entry.amount))}${entry.reason ? ` · ${entry.reason}` : ""}`));
  }
  return message.join("\n");
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
