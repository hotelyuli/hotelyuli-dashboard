import { normalizeReservationRow } from "@/features/operations/logic/reservation-normalizer";

/**
 * One room of one booking as an imported Little Hotelier file lists it, on the file's date.
 * room_id null = a room of that line could not be resolved: retirement skips that whole date.
 */
export type SeenRow = { date: string; reference: string | null; guest: string | null; room_id: string | null };

/**
 * What a check-in / check-out file lists: per booking line and room, its date (arrival for a
 * check-in file, departure for a check-out file), Reservation Number, guest and room, resolved
 * exactly like the import. `invalidRows` counts lines that can't be read at all (no usable date):
 * then nobody knows which dates the file covers completely, and retirement must not run.
 */
export function seenFromImport(rows: Record<string, string>[], headers: string[], fileType: "check_in" | "check_out", unitCodeToRoomId: ReadonlyMap<string, string>): { seen: SeenRow[]; invalidRows: number } {
  let invalidRows = 0;
  const seen = rows.flatMap((row): SeenRow[] => {
    const normalized = normalizeReservationRow(row, headers, fileType);
    if (!normalized.ok) { invalidRows += 1; return []; }
    const r = normalized.reservation;
    const base = { date: fileType === "check_in" ? r.arrivalDate : r.departureDate, reference: r.reference?.trim() || null, guest: r.guestName };
    const resolved = r.roomUnitCodes.map((code) => ({ ...base, room_id: unitCodeToRoomId.get(code) ?? null }));
    // A room token the resolver didn't understand: the line is incomplete for its date.
    return normalized.warnings.length ? [...resolved, { ...base, room_id: null }] : resolved;
  });
  return { seen, invalidRows };
}
