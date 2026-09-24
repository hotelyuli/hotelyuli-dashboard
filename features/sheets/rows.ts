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

/** Header comparison key: case, accents and ALL whitespace ignored ("GUEST NAME/ PAX QTY" = "GUEST NAME/PAX QTY"). */
export function headerKey(cell: unknown): string {
  return String(cell ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toUpperCase();
}

/** Where our columns sit in a sheet: the header row and, per field (in our order), its 0-based sheet column. */
export type HeaderLayout = { rowIndex: number; columns: number[] };

/**
 * Finds the header row among `rows` that contains every expected header, in any
 * order and among any extra columns (COMPROBANTE #, Column 1, ...). Null if none.
 */
export function findHeaderLayout(rows: readonly (readonly unknown[])[], headers: readonly string[]): HeaderLayout | null {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const keys = (rows[rowIndex] ?? []).map(headerKey);
    const columns = headers.map((header) => keys.indexOf(headerKey(header)));
    if (columns.every((column) => column >= 0)) return { rowIndex, columns };
  }
  return null;
}

/** Expected headers not found in the best-matching row among `rows` (for the error message). */
export function missingHeaders(rows: readonly (readonly unknown[])[], headers: readonly string[]): string[] {
  let best: string[] = [...headers];
  for (const row of rows) {
    const keys = new Set((row ?? []).map(headerKey));
    const missing = headers.filter((header) => !keys.has(headerKey(header)));
    if (missing.length < best.length) best = missing;
  }
  return best;
}

/** Index (0-based) of the header row among `rows`, or -1. */
export function findHeaderRow(rows: readonly (readonly unknown[])[], headers: readonly string[]): number {
  return findHeaderLayout(rows, headers)?.rowIndex ?? -1;
}

/**
 * Our row (in our header order) spread onto the sheet's columns. Every other
 * column is null, which the Sheets API skips - so unknown columns are left untouched.
 */
export function toSheetRow(row: readonly Cell[], columns: readonly number[]): (Cell | null)[] {
  const sheetRow: (Cell | null)[] = Array.from({ length: Math.max(...columns) + 1 }, () => null);
  columns.forEach((column, index) => { sheetRow[column] = row[index] ?? ""; });
  return sheetRow;
}

/** A sheet row read back into our header order. */
export function fromSheetRow(sheetRow: readonly unknown[], columns: readonly number[]): Cell[] {
  return columns.map((column) => {
    const value = sheetRow[column];
    return typeof value === "number" ? value : String(value ?? "");
  });
}

/** 0-based column index -> A1 letters (0 -> A, 26 -> AA). */
export function columnLetter(index: number): string {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
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
