// Row mapping for the Google Sheets export: one row per record, in the exact
// column order of the existing sheets (owner-confirmed headers).

export const INCOME_HEADERS = ["CATEGORIES", "TOTAL", "DATE", "DESCRIPTION", "CLIENT", "SOURCE OF PAYMENT", "RESERVATION DATE"] as const;
export const TOURS_HEADERS = ["TOUR DATE", "TOUR OPERATOR", "TYPE OF TOUR", "GUEST NAME/PAX QTY", "TOTAL TOUR", "TOTAL COMISSION", "STATUS", "PAYMENT METHOD", "BOOKED BY"] as const;

export type Cell = string | number;

export type TourRecord = {
  id: string;
  tour_date: string;
  operator_name: string;
  tour_name: string;
  guest_name: string;
  adults: number;
  children: number;
  total_price: number | string;
  commission_amount: number | string;
  currency: "USD" | "CRC";
  status: string;
  booked_by: string;
};

export type IncomeRecord = {
  id: string;
  operation_date: string;
  category: string;
  amount: number | string;
  currency: "USD" | "CRC";
  payment_method: string;
  reference_note: string | null;
  guest_name: string;
  room_number: string | null;
  paid: boolean;
  entry_type: "payment" | "reversal";
  reason: string | null;
};

/** Looked up at send time: the linked reservation's channel and arrival date, when there is one. */
export type IncomeEnrichment = { bookingChannel: string | null; reservationDate: string | null };

/**
 * Rows are written with USER_ENTERED so dates and numbers behave like typed values.
 * Text that Sheets would treat as a formula (= + - @) is forced to plain text.
 */
export function textCell(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

/**
 * USD amounts are real numbers. CRC amounts are written as "CRC 5000" text so a
 * column total in the sheet can never silently add colones to dollars.
 */
export function moneyCell(currency: "USD" | "CRC", amount: number): Cell {
  const rounded = Math.round(amount * 100) / 100;
  return currency === "USD" ? rounded : `CRC ${rounded.toFixed(2)}`;
}

const TOUR_STATUS: Record<string, string> = { paid: "Paid", pending: "Pending", cancelled: "Cancelled" };

export function tourRow(tour: TourRecord): Cell[] {
  const pax = (tour.adults ?? 0) + (tour.children ?? 0);
  return [
    tour.tour_date,
    textCell(tour.operator_name),
    textCell(tour.tour_name),
    textCell(`${tour.guest_name.trim()} / ${pax}`),
    moneyCell(tour.currency, Number(tour.total_price)),
    moneyCell(tour.currency, Number(tour.commission_amount)),
    TOUR_STATUS[tour.status] ?? textCell(tour.status),
    "", // PAYMENT METHOD: left blank (the travel office handles tour payment)
    textCell(tour.booked_by)
  ];
}

/** Settled money only: unpaid entries are never exported. */
export function shouldExportIncome(income: IncomeRecord): boolean {
  return income.paid;
}

export function incomeRow(income: IncomeRecord, enrichment: IncomeEnrichment): Cell[] {
  const reversal = income.entry_type === "reversal";
  const amount = Number(income.amount);
  const description = reversal
    ? `Anulación / Reversal${income.reason ? `: ${income.reason}` : ""}${income.reference_note ? ` · ${income.reference_note}` : ""}`
    : [income.reference_note, income.room_number ? `Room ${income.room_number.replace(/^Habitaci[oó]n\s*/i, "")}` : null].filter(Boolean).join(" · ");
  return [
    // CATEGORIES = the booking channel exactly as stored (never the internal category); blank when none.
    textCell(enrichment.bookingChannel ?? ""),
    moneyCell(income.currency, reversal ? -amount : amount),
    income.operation_date,
    textCell(description),
    textCell(income.guest_name),
    textCell(income.payment_method),
    enrichment.reservationDate ?? ""
  ];
}

/** The text columns that identify a tour row (operator, tour, guest/pax) - used to re-find it before updating. */
export function tourRowKey(row: readonly Cell[]): string {
  return [row[1], row[2], row[3]].map((cell) => String(cell ?? "").trim().toLowerCase()).join("|");
}

const normalizeHeader = (cell: unknown) => String(cell ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/** Index (0-based) of the row among `rows` whose first cells equal the expected headers, or -1. */
export function findHeaderRow(rows: readonly (readonly unknown[])[], headers: readonly string[]): number {
  return rows.findIndex((row) => headers.every((header, index) => normalizeHeader(row[index]) === normalizeHeader(header)));
}

const MONTHS_ES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** Monthly tab for an entry date: "2026-09-24" -> "SEPTIEMBRE2026" (Spanish month, caps, no space). */
export function monthTabName(isoDate: string): string {
  const [year, month] = isoDate.slice(0, 10).split("-");
  const name = MONTHS_ES[Number(month) - 1];
  if (!name || !/^\d{4}$/.test(year ?? "")) throw new Error(`SHEETS_BAD_DATE: cannot pick a monthly tab for "${isoDate}"`);
  return `${name}${year}`;
}

/**
 * Comparison key for tab names: case, spaces, punctuation and accents ignored, and
 * the Costa Rican spelling SETIEMBRE treated as SEPTIEMBRE - so an existing
 * "Setiembre 2026" tab is reused instead of creating a second September tab.
 */
export function tabKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^SETIEMBRE/, "SEPTIEMBRE");
}
