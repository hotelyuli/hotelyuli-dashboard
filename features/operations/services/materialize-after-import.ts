import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { materializeBoard, type ReservationForBoard, type UnitForBoard } from "@/features/operations/logic/board";
import { planMaterialization } from "@/features/operations/logic/materialize-plan";
import { normalizeReservationRow } from "@/features/operations/logic/reservation-normalizer";

type Client = SupabaseClient<Database>;
export type MaterializeWarning = { row: number; message: string };

export async function materializeAfterImport(params: {
  supabase: Client;
  hotelId: string;
  operationDate: string;
  fileType: "check_in" | "check_out";
  headers: string[];
  rows: Record<string, string>[];
  sourceImportId: string;
}): Promise<{ warnings: MaterializeWarning[] }> {
  const { supabase, hotelId, operationDate, fileType, headers, rows, sourceImportId } = params;

  const { data: rooms } = await supabase.from("rooms").select("id, unit_code").eq("hotel_id", hotelId);
  const unitCodeToRoomId = new Map((rooms ?? []).map((room) => [room.unit_code, room.id]));
  const warnings: MaterializeWarning[] = [];

  await reconcileReservationRows({ supabase, hotelId, rows, headers, fileType, unitCodeToRoomId, sourceImportId, warnings });
  await materializeBoardForDate({ supabase, hotelId, operationDate });
  return { warnings };
}

async function reconcileReservationRows(params: {
  supabase: Client;
  hotelId: string;
  rows: Record<string, string>[];
  headers: string[];
  fileType: "check_in" | "check_out";
  unitCodeToRoomId: Map<string, string>;
  sourceImportId: string;
  warnings: MaterializeWarning[];
}) {
  const { supabase, hotelId, rows, headers, fileType, unitCodeToRoomId, sourceImportId, warnings } = params;

  for (const [index, row] of rows.entries()) {
    const normalized = normalizeReservationRow(row, headers, fileType);
    if (!normalized.ok) {
      warnings.push({ row: index, message: normalized.error });
      continue;
    }
    for (const warning of normalized.warnings) warnings.push({ row: index, message: `UNMATCHED_ROOM_TOKEN:${warning}` });

    for (const unitCode of normalized.reservation.roomUnitCodes) {
      const roomId = unitCodeToRoomId.get(unitCode);
      if (!roomId) {
        warnings.push({ row: index, message: `UNKNOWN_ROOM_CODE:${unitCode}` });
        continue;
      }
      const { error } = await supabase.from("reservations").upsert(
        {
          hotel_id: hotelId,
          reference: normalized.reservation.reference,
          guest_name: normalized.reservation.guestName,
          room_id: roomId,
          arrival_date: normalized.reservation.arrivalDate,
          departure_date: normalized.reservation.departureDate,
          adults: normalized.reservation.adults,
          children: normalized.reservation.children,
          babies: normalized.reservation.babies,
          total_amount: normalized.reservation.totalAmount,
          outstanding_balance: normalized.reservation.outstandingBalance,
          currency: normalized.reservation.currency,
          booking_channel: normalized.reservation.bookingChannel,
          notes: normalized.reservation.notes,
          source_import_id: sourceImportId,
          updated_at: new Date().toISOString()
        },
        { onConflict: "hotel_id,reference,arrival_date,room_id" }
      );
      if (error) warnings.push({ row: index, message: `SAVE_FAILED:${error.message}` });
    }
  }
}

export async function materializeBoardForDate(params: { supabase: Client; hotelId: string; operationDate: string }) {
  const { supabase, hotelId, operationDate } = params;

  const { data: rooms } = await supabase.from("rooms").select("id, active").eq("hotel_id", hotelId);
  const units: UnitForBoard[] = (rooms ?? []).map((room) => ({ roomId: room.id, outOfService: !room.active }));
  if (!units.length) return;

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, room_id, guest_name, arrival_date, departure_date, adults, children, babies, outstanding_balance, currency")
    .eq("hotel_id", hotelId)
    .lte("arrival_date", operationDate)
    .gte("departure_date", operationDate);

  const reservationsForBoard: ReservationForBoard[] = (reservations ?? []).map((reservation) => ({
    id: reservation.id,
    roomId: reservation.room_id,
    guestName: reservation.guest_name,
    arrivalDate: reservation.arrival_date,
    departureDate: reservation.departure_date,
    adults: reservation.adults,
    children: reservation.children,
    babies: reservation.babies,
    outstandingBalance: reservation.outstanding_balance,
    currency: reservation.currency
  }));

  const cells = materializeBoard(units, reservationsForBoard, operationDate);

  const { data: existingRows } = await supabase
    .from("daily_operations")
    .select("room_id, manually_modified")
    .eq("hotel_id", hotelId)
    .eq("operation_date", operationDate);

  const plan = planMaterialization(
    cells,
    (existingRows ?? []).map((row) => ({ roomId: row.room_id, manuallyModified: row.manually_modified }))
  );
  if (!plan.toWrite.length) return;

  const upsertRows = plan.toWrite.map((cell) => ({
    hotel_id: hotelId,
    operation_date: operationDate,
    room_id: cell.roomId,
    reservation_id: cell.reservationId,
    guest_name: cell.guestName,
    adults: cell.adults,
    children: cell.children,
    babies: cell.babies,
    total_pax: cell.adults + cell.children + cell.babies,
    arrival_date: cell.arrivalDate,
    departure_date: cell.departureDate,
    operational_status: cell.operationalStatus,
    housekeeping_category: cell.housekeepingCategory,
    same_day_arrival: cell.sameDayArrival,
    payment_status: cell.paymentStatus,
    outstanding_balance: cell.outstandingBalance,
    currency: cell.currency,
    manually_modified: false,
    updated_at: new Date().toISOString()
  }));

  await supabase.from("daily_operations").upsert(upsertRows, { onConflict: "hotel_id,operation_date,room_id" });
}
