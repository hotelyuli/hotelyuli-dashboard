/**
 * Pax totals, shared by every place that adds up guests or breakfast covers.
 * Little Hotelier lists a dorm booking once with all its beds ("B1, B2, B3, B4"); the importer stores
 * one reservation row per bed, each carrying the booking's full pax. A dorm stay therefore counts once:
 * same reference + arrival, else same guest + arrival + departure, else same reservation id.
 * Bed rows of different bookings keep adding up; rooms count every row.
 */
export type PaxRow = {
  dorm: boolean;
  pax: number;
  reference?: string | null;
  reservationId?: string | null;
  guestName?: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
};

/** The booking a dorm bed row belongs to, or null when the row counts on its own. */
export function paxStayKey(row: PaxRow): string | null {
  if (!row.dorm) return null;
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

/** One booking's pax: the same on every bed row; if a row was edited, the highest wins. */
export const stayPax = (group: PaxRow[]) => Math.max(0, ...group.map((row) => row.pax));

export function totalPax(rows: PaxRow[]) {
  return groupByStay(rows).reduce((sum, group) => sum + stayPax(group), 0);
}

/** A daily_operations row as a PaxRow; `pax` picks total_pax or breakfast_pax. */
export function operationPaxRow(
  row: { reservation_id: string | null; guest_name: string | null; arrival_date: string | null; departure_date: string | null },
  dorm: boolean,
  pax: number
): PaxRow {
  return { dorm, pax, reservationId: row.reservation_id, guestName: row.guest_name, arrivalDate: row.arrival_date, departureDate: row.departure_date };
}
