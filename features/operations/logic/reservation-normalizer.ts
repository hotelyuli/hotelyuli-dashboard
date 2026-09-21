import { addDaysToIsoDate, parseCsvDate } from "./parse-date";
import { resolveRoomTokens } from "./room-resolver";

export type NormalizedReservation = {
  reference: string | null;
  guestName: string | null;
  roomUnitCodes: string[];
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  babies: number;
  totalAmount: number | null;
  outstandingBalance: number | null;
  /** Locked assumption (docs/csv-import.md): Little Hotelier reports in the hotel's base currency, USD. Never inferred per-row. */
  currency: "USD";
  bookingChannel: null;
  notes: string | null;
};

export type NormalizeReservationError =
  | "MISSING_REQUIRED_FIELDS"
  | "INVALID_ARRIVAL_DATE"
  | "INVALID_DEPARTURE_DATE"
  | "INVALID_LOS"
  | "UNRESOLVED_ROOM";

export type NormalizeResult =
  | { ok: true; reservation: NormalizedReservation; warnings: string[] }
  | { ok: false; error: NormalizeReservationError };

// Locked header contract (docs/csv-import.md), matched case- and
// accent-insensitively. The check-in file has no departure column and the
// check-out file has no arrival column — both are derived from LoS (nights).
const HEADER_ALIASES = {
  reference: ["reservation number", "reference", "booking reference", "reservation id", "referencia"],
  guestName: ["guest", "guest name", "huesped", "nombre"],
  room: ["room number", "room", "room type", "unit", "habitacion"],
  checkIn: ["check in", "arrival", "arrival date", "check-in date", "checkin date", "llegada", "fecha de llegada"],
  checkOut: ["check out", "departure", "departure date", "check-out date", "checkout date", "salida", "fecha de salida"],
  los: ["los", "length of stay", "noches"],
  pax: ["adults / children / infants", "adults/children/infants", "pax"],
  total: ["total amount", "total", "monto total"],
  balance: ["outstanding balance", "balance", "saldo"],
  notes: ["note", "notes", "nota", "notas"]
} as const;

export function normalizeReservationRow(row: Record<string, string>, headers: string[], fileType: "check_in" | "check_out"): NormalizeResult {
  const dateRaw = findValue(row, headers, fileType === "check_in" ? HEADER_ALIASES.checkIn : HEADER_ALIASES.checkOut);
  const losRaw = findValue(row, headers, HEADER_ALIASES.los);
  const roomRaw = findValue(row, headers, HEADER_ALIASES.room);
  if (!dateRaw || !losRaw || !roomRaw) return { ok: false, error: "MISSING_REQUIRED_FIELDS" };

  const parsedDate = parseCsvDate(dateRaw);
  if (!parsedDate.ok) return { ok: false, error: fileType === "check_in" ? "INVALID_ARRIVAL_DATE" : "INVALID_DEPARTURE_DATE" };

  const los = Number.parseInt(losRaw, 10);
  if (!Number.isInteger(los) || los < 1) return { ok: false, error: "INVALID_LOS" };

  const arrivalDate = fileType === "check_in" ? parsedDate.isoDate : addDaysToIsoDate(parsedDate.isoDate, -los);
  const departureDate = fileType === "check_in" ? addDaysToIsoDate(parsedDate.isoDate, los) : parsedDate.isoDate;

  const resolvedRoom = resolveRoomTokens(roomRaw);
  if (!resolvedRoom.unitCodes.length) return { ok: false, error: "UNRESOLVED_ROOM" };

  const pax = parsePax(findValue(row, headers, HEADER_ALIASES.pax));

  return {
    ok: true,
    warnings: resolvedRoom.warnings,
    reservation: {
      reference: findValue(row, headers, HEADER_ALIASES.reference) ?? null,
      guestName: findValue(row, headers, HEADER_ALIASES.guestName) ?? null,
      roomUnitCodes: resolvedRoom.unitCodes,
      arrivalDate,
      departureDate,
      adults: pax.adults,
      children: pax.children,
      babies: pax.infants,
      totalAmount: toNumberOrNull(findValue(row, headers, HEADER_ALIASES.total)),
      outstandingBalance: toNumberOrNull(findValue(row, headers, HEADER_ALIASES.balance)),
      currency: "USD",
      bookingChannel: null,
      notes: findValue(row, headers, HEADER_ALIASES.notes) ?? null
    }
  };
}

function parsePax(raw?: string): { adults: number; children: number; infants: number } {
  const parts = raw?.split("/").map((part) => Number.parseInt(part.trim(), 10)) ?? [];
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return { adults: 0, children: 0, infants: 0 };
  const [adults, children, infants] = parts;
  return { adults, children, infants };
}

function findValue(row: Record<string, string>, headers: string[], aliases: readonly string[]): string | undefined {
  for (const header of headers) {
    const normalizedHeader = normalizeHeader(header);
    if (aliases.some((alias) => normalizeHeader(alias) === normalizedHeader)) {
      const value = row[header];
      if (value !== undefined && value.trim() !== "") return value.trim();
    }
  }
  return undefined;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function toNumberOrNull(value?: string): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
