import { resolveRoomTokens } from "./room-resolver";

/** A tour shown in the Room board's Tours column. */
export type BoardTour = { id: string; tourName: string; tourDate: string; status: "pending" | "paid" };

export type TourBookingForBoard = {
  id: string;
  room_number: string | null;
  guest_name: string;
  tour_name: string;
  tour_date: string;
  operation_date: string;
  status: string;
};

/**
 * Supabase `.or()` filter for the board's tours: booked today (so a tour booked from
 * the board shows immediately, whatever its date) or taking place today or later.
 */
export const boardToursFilter = (operationDate: string) => `operation_date.eq.${operationDate},tour_date.gte.${operationDate}`;

const sameGuest = (a: string | null | undefined, b: string | null | undefined) =>
  !!a?.trim() && !!b?.trim() && a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * Tours per board unit (unit_code), linked by the tour's room ("5", "Habitación 5", "B3").
 * Cancelled tours are left out. When the room names several units (e.g. "dorm"), the tour
 * goes to the unit whose guest matches, else the first of them. Sorted by tour date.
 */
export function toursByUnit(
  tours: readonly TourBookingForBoard[],
  operationDate: string,
  guestByUnit: ReadonlyMap<string, string | null> = new Map()
): Map<string, BoardTour[]> {
  const byUnit = new Map<string, BoardTour[]>();
  for (const tour of tours) {
    if (tour.status === "cancelled" || !tour.room_number?.trim()) continue;
    if (tour.operation_date !== operationDate && tour.tour_date < operationDate) continue;
    const units = resolveRoomTokens(tour.room_number).unitCodes;
    if (!units.length) continue;
    const targets = units.length === 1 ? units : units.filter((unit) => sameGuest(guestByUnit.get(unit), tour.guest_name));
    for (const unit of targets.length ? targets : units.slice(0, 1)) {
      const list = byUnit.get(unit) ?? [];
      list.push({ id: tour.id, tourName: tour.tour_name, tourDate: tour.tour_date, status: tour.status === "paid" ? "paid" : "pending" });
      byUnit.set(unit, list);
    }
  }
  for (const list of byUnit.values()) list.sort((a, b) => a.tourDate.localeCompare(b.tourDate) || a.tourName.localeCompare(b.tourName));
  return byUnit;
}
