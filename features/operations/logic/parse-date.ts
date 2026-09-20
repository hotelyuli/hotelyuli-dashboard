/**
 * Locked CSV date contract (confirmed against real Little Hotelier exports,
 * see docs/csv-import.md): DD-MM-YYYY with dashes is the primary format.
 * ISO YYYY-MM-DD is kept as a tolerant fallback since it's unambiguous.
 * Anything else is rejected rather than guessed at.
 */
export const CSV_DATE_DEFAULT_FORMAT = "DD-MM-YYYY";

export type ParsedCsvDate = { ok: true; isoDate: string } | { ok: false; error: "INVALID_DATE" };

const DASH_PATTERN = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCsvDate(raw: string): ParsedCsvDate {
  const value = raw.trim();

  const dash = value.match(DASH_PATTERN);
  if (dash) return validate(Number(dash[3]), Number(dash[2]), Number(dash[1]));

  const iso = value.match(ISO_PATTERN);
  if (iso) return validate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  return { ok: false, error: "INVALID_DATE" };
}

function validate(year: number, month: number, day: number): ParsedCsvDate {
  if (month < 1 || month > 12 || day < 1 || day > 31) return { ok: false, error: "INVALID_DATE" };
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate) return { ok: false, error: "INVALID_DATE" };
  return { ok: true, isoDate: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

/** Pure ISO-date arithmetic used to derive the missing side of a stay from LoS (length of stay, in nights). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
