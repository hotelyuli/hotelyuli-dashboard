import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { materializeBoard, type ReservationForBoard, type UnitForBoard } from "@/features/operations/logic/board";
import { planMaterialization } from "@/features/operations/logic/materialize-plan";
import { normalizeReservationRow } from "@/features/operations/logic/reservation-normalizer";

import { breakfastFromNotes } from "@/features/operations/logic/breakfast";
import { seenFromImport } from "@/features/csv-import/logic/import-seen";
import { inactiveReservations, withActiveReservations } from "@/features/operations/services/active-reservations";
import { retireMissingFromImport, type RetirementResult } from "@/features/operations/services/retirement";
import { isMissingSchema } from "@/lib/db/schema-errors";

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
}): Promise<{ warnings: MaterializeWarning[]; retirement: RetirementResult | null }> {
  const { supabase, hotelId, operationDate, fileType, headers, rows, sourceImportId } = params;

  const { data: rooms } = await supabase.from("rooms").select("id, unit_code").eq("hotel_id", hotelId);
  const unitCodeToRoomId = new Map((rooms ?? []).map((room) => [room.unit_code, room.id]));
  const warnings: MaterializeWarning[] = [];

  await reconcileReservationRows({ supabase, hotelId, rows, headers, fileType, unitCodeToRoomId, sourceImportId, warnings });
  // What the file no longer lists for its dates: only LISTED here; a person confirms before anything retires.
  const retirement = await retireMissingFromImport(supabase, { importId: sourceImportId, fileType, ...seenFromImport(rows, headers, fileType, unitCodeToRoomId) });
  await materializeBoardForDate({ supabase, hotelId, operationDate });
  return { warnings, retirement };
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
  // A row LH lists (again) is active: clear any retirement / "moved in LH" flag (migration 0032).
  // Before 0032 those columns don't exist; the first upsert then tells us and we stop sending them.
  let reactivate: Record<string, null> = { retired_at: null, retired_reason: null, retired_by_import_id: null, retired_by: null, review_flag: null, review_flag_detail: null, flagged_by_import_id: null, reviewed_at: null, reviewed_by: null };

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
      const payload = {
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
          ...(normalized.reservation.notes !== null ? { notes: normalized.reservation.notes } : {}),
          source_import_id: sourceImportId,
          updated_at: new Date().toISOString()
      };
      const upsert = (extra: Record<string, null>) => supabase.from("reservations").upsert({ ...payload, ...extra }, { onConflict: "hotel_id,reference,arrival_date,room_id" });
      let { error } = await upsert(reactivate);
      if (error && Object.keys(reactivate).length && isMissingSchema(error)) {
        reactivate = {};
        ({ error } = await upsert(reactivate));
      }
      if (error) warnings.push({ row: index, message: `SAVE_FAILED:${error.message}` });
    }
  }
}

export async function materializeBoardForDate(params: { supabase: Client; hotelId: string; operationDate: string }) {
  const { supabase, hotelId, operationDate } = params;

  const { data: rooms } = await supabase.from("rooms").select("id, active").eq("hotel_id", hotelId);
  const units: UnitForBoard[] = (rooms ?? []).map((room) => ({ roomId: room.id, outOfService: !room.active }));
  if (!units.length) return;

  // Only reservations that count: a retired or moved-in-LH row never occupies a room on the board.
  const { data: reservations } = await withActiveReservations((table) => supabase
    .from(table)
    .select("id, room_id, guest_name, arrival_date, departure_date, adults, children, babies, outstanding_balance, currency, notes, booking_channel")
    .eq("hotel_id", hotelId)
    .lte("arrival_date", operationDate)
    .gte("departure_date", operationDate));

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
    .select("room_id, manually_modified, reservation_id, payment_status")
    .eq("hotel_id", hotelId)
    .eq("operation_date", operationDate);

  // A row whose reservation was retired / moved in LH is kept exactly as it is when staff edited it
  // or it is Pagado / Parcial: never overwritten or deleted, only hidden by the selector. Other rows
  // are rebuilt from the reservations that count.
  const inactive = await inactiveReservations(supabase, hotelId, (existingRows ?? []).map((row) => row.reservation_id));
  const plan = planMaterialization(
    cells,
    (existingRows ?? []).map((row) => ({
      roomId: row.room_id,
      manuallyModified: row.manually_modified || (Boolean(row.reservation_id && inactive.has(row.reservation_id)) && (row.payment_status === "paid" || row.payment_status === "partial"))
    }))
  );
  if (!plan.toWrite.length) return;

  const reservationById = new Map((reservations ?? []).map((reservation) => [reservation.id, reservation]));
  const upsertRows = plan.toWrite.map((cell) => ({
    ...breakfastFromNotes(reservationById.get(cell.reservationId ?? "")?.notes ?? null, cell.adults, cell.children),
    booking_channel: reservationById.get(cell.reservationId ?? "")?.booking_channel ?? null,
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

  const { error } = await supabase.from("daily_operations").upsert(upsertRows, { onConflict: "hotel_id,operation_date,room_id" });
  if (error) throw new Error("BOARD_SAVE_FAILED");
}
