/**
 * Pax totals, shared by every place that adds up guests or breakfast covers.
 * Little Hotelier lists a booking once with all its rooms or beds ("Room 14,Room 18", "B1, B2");
 * the importer stores one reservation row per room/bed, each carrying the booking's FULL pax.
 * A booking therefore counts once, whatever number of rooms or beds it holds:
 * same reference + arrival, else same guest + arrival + departure, else same reservation id.
 * Until staff split the pax per room, the booking's pax sits on its first room (in the order
 * given, i.e. board order) and the other rooms count 0, with a visible "repartir pax" warning.
 */
export type PaxRow = {
  /** A Room 20 bed: a booking over several beds is counted once and needs no per-bed split. */
  dorm: boolean;
  pax: number;
  reference?: string | null;
  reservationId?: string | null;
  guestName?: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
};

/** The booking a row belongs to, or null when the row counts on its own. */
export function paxStayKey(row: PaxRow): string | null {
  const reference = row.reference?.trim();
  if (reference && row.arrivalDate) return `ref:${reference}|${row.arrivalDate}`;
  const guest = row.guestName?.trim().toLowerCase().replace(/\s+/g, " ");
  if (guest && row.arrivalDate && row.departureDate) return `guest:${guest}|${row.arrivalDate}|${row.departureDate}`;
  return row.reservationId ? `id:${row.reservationId}` : null;
}

/** Rows grouped by booking, in first-seen order; rows without a key stay alone. */
export function groupByStay<T extends PaxRow>(rows: T[]): T[][] {
  const groups: T[][] = [];
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = paxStayKey(row);
    const group = key ? byKey.get(key) : undefined;
    if (group) {
      group.push(row);
      continue;
    }
    const created = [row];
    if (key) byKey.set(key, created);
    groups.push(created);
  }
  return groups;
}

/** One booking's pax: the same on every row; if a row was edited, the highest wins. */
export const stayPax = (group: PaxRow[]) => Math.max(0, ...group.map((row) => row.pax));

/** A booking held by several rooms or beds. `first` is the row that carries its pax. */
export type PaxGroup = { size: number; first: boolean; firstIndex: number; dorm: boolean };
export type AllocatedPax = { pax: number; group: PaxGroup | null };

/**
 * Per row, what it counts: each booking once, on its first row; the booking's other rows 0.
 * Summing `pax` over the result is the hotel total, so a room list and its total always agree.
 */
export function allocatePax(rows: PaxRow[]): AllocatedPax[] {
  const indexesByKey = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = paxStayKey(row);
    if (key) indexesByKey.set(key, [...(indexesByKey.get(key) ?? []), index]);
  });
  const result: AllocatedPax[] = rows.map((row) => ({ pax: row.pax, group: null }));
  for (const indexes of indexesByKey.values()) {
    if (indexes.length < 2) continue;
    const group = indexes.map((index) => rows[index]);
    const dorm = group.every((row) => row.dorm);
    indexes.forEach((index, position) => {
      result[index] = { pax: position === 0 ? stayPax(group) : 0, group: { size: indexes.length, first: position === 0, firstIndex: indexes[0], dorm } };
    });
  }
  return result;
}

export const totalPax = (rows: PaxRow[]) => allocatePax(rows).reduce((sum, row) => sum + row.pax, 0);

/** Board warning for a booking over several rooms whose pax is not split yet (dorm beds need none). */
export function splitPaxWarning(group: PaxGroup | null, es: boolean): string | null {
  if (!group || group.dorm) return null;
  return es ? `Reserva en ${group.size} habitaciones – repartir pax` : `Booking in ${group.size} rooms – split pax`;
}

/** A daily_operations row as a PaxRow; `pax` picks total_pax or breakfast_pax. */
export function operationPaxRow(
  row: { reservation_id: string | null; guest_name: string | null; arrival_date: string | null; departure_date: string | null },
  dorm: boolean,
  pax: number,
  reference: string | null = null
): PaxRow {
  return { dorm, pax, reference, reservationId: row.reservation_id, guestName: row.guest_name, arrivalDate: row.arrival_date, departureDate: row.departure_date };
}
