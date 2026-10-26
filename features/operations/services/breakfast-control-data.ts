import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { addDays, controlEntries, freeRooms, pendingSplits, summarizeBreakfastControl, type ControlDayRow } from "@/features/operations/logic/breakfast-control";
import { reservationSplits } from "@/features/operations/logic/pax";
import { withActiveReservations } from "@/features/operations/services/active-reservations";
import { splitSources } from "@/features/operations/services/reservation-references";

/**
 * Everything "Control de desayunos" shows for breakfast on `day`: the room lines and totals (card,
 * PDF, print, Copiar texto, WhatsApp) and the bookings whose pax still need a split.
 */
export async function loadBreakfastControl(supabase: SupabaseClient<Database>, hotelId: string, day: string) {
  const previousDay = addDays(day, -1);
  // Active reservations only (shared selector): a cancelled or moved-in-LH row never gets breakfast.
  // The split columns exist from migration 0033 on; before it every booking reads as not split.
  const columns = "id, reference, room_id, guest_name, arrival_date, departure_date, adults, children, babies, notes";
  const loadReservations = (select: string) => withActiveReservations((table) => supabase.from(table).select(select).eq("hotel_id", hotelId).lt("arrival_date", day).gte("departure_date", day));
  const [{ data: rooms }, loadedReservations, { data: operations }] = await Promise.all([
    supabase.from("rooms").select("id, room_number, unit_type, parent_room_number, sort_order, active").eq("hotel_id", hotelId),
    loadReservations(`${columns}, split_adults, split_children, split_babies, split_breakfast`),
    supabase.from("daily_operations").select("operation_date, room_id, reservation_id, breakfast_status, breakfast_pax, breakfast_to_go, breakfast_to_go_time, breakfast_notes").eq("hotel_id", hotelId).in("operation_date", [previousDay, day])
  ]);

  type Loaded = Parameters<typeof splitSources>[0][number] & { room_id: string; guest_name: string | null; departure_date: string; notes: string | null };
  const reservations = ((isMissingSchema(loadedReservations.error) ? await loadReservations(columns) : loadedReservations).data ?? []) as unknown as Loaded[];
  const splits = reservationSplits(splitSources(reservations));
  const units = (rooms ?? []).map((room) => ({ roomId: room.id, roomNumber: room.room_number, unitType: room.unit_type, parentRoomNumber: room.parent_room_number, sortOrder: room.sort_order, active: room.active }));
  const toDayRow = (row: NonNullable<typeof operations>[number]): ControlDayRow => ({ roomId: row.room_id, reservationId: row.reservation_id, breakfastStatus: row.breakfast_status, breakfastPax: row.breakfast_pax, breakfastToGo: row.breakfast_to_go, breakfastToGoTime: row.breakfast_to_go_time, breakfastNotes: row.breakfast_notes });
  const entries = controlEntries({
    date: day,
    units,
    splits,
    reservations: reservations.map((r) => ({ id: r.id, reference: r.reference, roomId: r.room_id, guestName: r.guest_name, arrivalDate: r.arrival_date, departureDate: r.departure_date, adults: r.adults, children: r.children, babies: r.babies, notes: r.notes })),
    dayRows: (operations ?? []).filter((row) => row.operation_date === day).map(toDayRow),
    previousDayRows: (operations ?? []).filter((row) => row.operation_date === previousDay).map(toDayRow)
  });
  return { summary: summarizeBreakfastControl({ entries, free: freeRooms(units, entries) }), pending: pendingSplits(entries) };
}
