/**
 * Pax totals, shared by every place that adds up guests or breakfast covers.
 * Little Hotelier lists a booking once with all its rooms or beds ("Room 14,Room 18", "B1, B2");
 * the importer stores one reservation row per room/bed, each carrying the booking's FULL pax.
 * A booking therefore counts once, whatever number of rooms or beds it holds:
 * same reference + arrival, else same guest + arrival + departure, else same reservation id.
 * Until staff split the pax per room, the booking's pax sits on its first room (in the order
 * given, i.e. board order) and the other rooms count 0, with a visible "reparto pendiente" warning.
 * Once a split is saved and still adds up (migration 0033), every room counts its own pax.
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
  /** The booking's pax are split per room (and the split still adds up): this row counts on its own. */
  split?: boolean;
  /** The booking's whole pax: a booking not split yet never counts less than this on its first row. */
  floor?: number;
  /** A split was saved but no longer adds up (LH changed the pax or the rooms). */
  resplit?: boolean;
};

/** The booking a row belongs to, or null when the row counts on its own. */
export function paxStayKey(row: PaxRow): string | null {
  if (row.split && row.reservationId) return `id:${row.reservationId}`;
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

/** One booking's pax: the same on every row; if a row was edited, the highest wins, never below the booking's pax. */
export const stayPax = (group: PaxRow[]) => Math.max(0, ...group.map((row) => Math.max(row.pax, row.floor ?? 0)));

/** A booking held by several rooms or beds. `first` is the row that carries its pax. */
export type PaxGroup = { size: number; first: boolean; firstIndex: number; dorm: boolean; resplit?: boolean };
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
  // A row of a booking over several rooms never counts less than the booking (`floor`), even when
  // it is the only one of its rooms listed (e.g. the only room marked with breakfast).
  const result: AllocatedPax[] = rows.map((row) => ({ pax: Math.max(row.pax, row.floor ?? 0), group: null }));
  for (const indexes of indexesByKey.values()) {
    if (indexes.length < 2) continue;
    const group = indexes.map((index) => rows[index]);
    const dorm = group.every((row) => row.dorm);
    const resplit = group.some((row) => row.resplit);
    indexes.forEach((index, position) => {
      result[index] = { pax: position === 0 ? stayPax(group) : 0, group: { size: indexes.length, first: position === 0, firstIndex: indexes[0], dorm, ...(resplit ? { resplit } : {}) } };
    });
  }
  return result;
}

export const totalPax = (rows: PaxRow[]) => allocatePax(rows).reduce((sum, row) => sum + row.pax, 0);

/** Board warning for a booking over several rooms whose pax is not split yet (dorm beds need none). */
export function splitPaxWarning(group: PaxGroup | null, es: boolean): string | null {
  if (!group || group.dorm) return null;
  if (group.resplit) return es ? `Reserva en ${group.size} habitaciones – la reserva cambió, repartir de nuevo` : `Booking in ${group.size} rooms – booking changed, split again`;
  return es ? `Reserva en ${group.size} habitaciones – reparto pendiente` : `Booking in ${group.size} rooms – split pending`;
}

/** A daily_operations row as a PaxRow; `pax` picks total_pax or breakfast_pax. */
export function operationPaxRow(
  row: { reservation_id: string | null; guest_name: string | null; arrival_date: string | null; departure_date: string | null },
  dorm: boolean,
  pax: number,
  reference: string | null = null,
  extra: Pick<PaxRow, "split" | "floor" | "resplit"> = {}
): PaxRow {
  return { dorm, pax, reference, reservationId: row.reservation_id, guestName: row.guest_name, arrivalDate: row.arrival_date, departureDate: row.departure_date, ...extra };
}

/* ---------- Per-room split (migration 0033) ---------- */

export type Pax3 = { adults: number; children: number; babies: number };
export type SplitState = "none" | "split" | "resplit";
/**
 * One reservation row's split, as every count uses it. `room` is what the room holds: its split
 * when the split is valid, else the booking's whole pax (as imported). `booking` is the whole
 * reservation's pax. `breakfast`: chosen for the whole booking in the split dialog (null = LH notes),
 * kept even when the split no longer adds up.
 */
export type ReservationSplit = { state: SplitState; room: Pax3; booking: Pax3; breakfast: boolean | null; reference: string | null; rooms: number };
export type SplitSource = Pax3 & {
  id: string; reference: string | null; arrivalDate: string;
  splitAdults?: number | null; splitChildren?: number | null; splitBabies?: number | null; splitBreakfast?: boolean | null;
};

const sumPax = (rows: Pax3[]): Pax3 => rows.reduce((sum, row) => ({ adults: sum.adults + row.adults, children: sum.children + row.children, babies: sum.babies + row.babies }), { adults: 0, children: 0, babies: 0 });
export const paxTotal = (pax: Pax3) => pax.adults + pax.children + pax.babies;
export const coverPax = (pax: Pax3) => pax.adults + pax.children;

/**
 * Split state per reservation row, from the active rows of the bookings (same reference + arrival;
 * all of a booking's rooms must be given). Valid ("split") only when every room has a split and
 * adults, children and babies each add up to the booking's: otherwise "resplit" (a split was saved,
 * LH changed something since) or "none". Same rule as the view reservation_split_check.
 */
export function reservationSplits(rows: SplitSource[]): Map<string, ReservationSplit> {
  const groups = new Map<string, SplitSource[]>();
  for (const row of rows) {
    const key = row.reference?.trim() ? `${row.reference.trim()}|${row.arrivalDate}` : `id:${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const result = new Map<string, ReservationSplit>();
  for (const group of groups.values()) {
    const booking = { adults: Math.max(...group.map((row) => row.adults)), children: Math.max(...group.map((row) => row.children)), babies: Math.max(...group.map((row) => row.babies)) };
    const hasSplit = (row: SplitSource) => row.splitAdults != null && row.splitChildren != null && row.splitBabies != null;
    const anySplit = group.length > 1 && group.some(hasSplit);
    const splits = group.map((row) => ({ adults: row.splitAdults ?? 0, children: row.splitChildren ?? 0, babies: row.splitBabies ?? 0 }));
    const total = sumPax(splits);
    const valid = anySplit && group.every(hasSplit) && total.adults === booking.adults && total.children === booking.children && total.babies === booking.babies;
    const state: SplitState = valid ? "split" : anySplit ? "resplit" : "none";
    const breakfast = group.find((row) => row.splitBreakfast != null)?.splitBreakfast ?? null;
    // The breakfast chosen for the booking stays when the split goes stale: until it is split again,
    // every room carries the booking's whole pax and its covers are counted once from there.
    group.forEach((row, index) => result.set(row.id, { state, room: valid ? splits[index] : booking, booking, breakfast, reference: row.reference, rooms: group.length }));
  }
  return result;
}

/**
 * PaxRow fields for a row of a reservation: counted on its own when split; a booking over several
 * rooms not split yet never counts below the booking's pax (covers: adults + children). A
 * single-room booking gets nothing: its own (possibly edited) number stands.
 */
export function splitPaxFields(split: ReservationSplit | undefined, covers = false): Pick<PaxRow, "split" | "floor" | "resplit"> {
  if (!split || split.rooms < 2) return {};
  if (split.state === "split") return { split: true };
  return { floor: covers ? coverPax(split.booking) : paxTotal(split.booking), ...(split.state === "resplit" ? { resplit: true } : {}) };
}

/**
 * "Reparto parejo": the booking's guests dealt to the rooms in turn (adults first, then children,
 * then babies), so the first rooms take the remainder: 20 pax over 12 rooms = 2 in the first 8,
 * 1 in the other 4, and every room gets an adult before any room gets a second guest.
 */
export function evenSplit(booking: Pax3, rooms: number): Pax3[] {
  const result = Array.from({ length: rooms }, () => ({ adults: 0, children: 0, babies: 0 }));
  if (!rooms) return result;
  let next = 0;
  for (const kind of ["adults", "children", "babies"] as const) {
    for (let i = 0; i < booking[kind]; i += 1) {
      result[next % rooms][kind] += 1;
      next += 1;
    }
  }
  return result;
}

/** What still differs from the booking's pax (all zero = the split can be saved). */
export function splitDifference(booking: Pax3, rooms: Pax3[]): Pax3 {
  const total = sumPax(rooms);
  return { adults: booking.adults - total.adults, children: booking.children - total.children, babies: booking.babies - total.babies };
}
