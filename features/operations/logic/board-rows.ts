import type { BoardRow } from "@/features/operations/components/RoomBoardTable";
import type { BoardTour } from "@/features/operations/logic/board-tours";
import type { BedSetup } from "@/features/operations/logic/room-setup";
import { allocatePax, type PaxRow } from "@/features/operations/logic/pax";

export type BoardRoom = { id: string; display_name: string; room_number: string; unit_code: string; unit_type: string; active: boolean };
export type BoardOperation = {
  id: string; room_id: string; reservation_id: string | null; guest_name: string | null; arrival_date: string | null;
  adults: number; children: number; babies: number; total_pax: number; departure_date: string | null;
  operational_status: BoardRow["operationalStatus"]; breakfast_status: BoardRow["breakfastStatus"]; breakfast_pax: number;
  breakfast_to_go: boolean; breakfast_notes: string | null; payment_status: string | null; payment_method: string | null;
  outstanding_balance: number | null; currency: string | null; car_plate: string | null; booking_channel: string | null; notes: string | null;
  housekeeping_category: string | null; same_day_arrival: boolean; housekeeper: string | null; bed_setup: string | null; breakfast_to_go_time: string | null;
};

/** The columns buildBoardRows reads from daily_operations. */
export const BOARD_OPERATION_COLUMNS =
  "id, room_id, reservation_id, guest_name, arrival_date, adults, children, babies, total_pax, departure_date, operational_status, breakfast_status, breakfast_pax, breakfast_to_go, breakfast_notes, payment_status, payment_method, outstanding_balance, currency, car_plate, booking_channel, notes, housekeeping_category, same_day_arrival, housekeeper, bed_setup, breakfast_to_go_time";

/**
 * Room board rows for one day (Operaciones and the dashboard), in room order. Each booking's
 * pax and breakfast covers are counted once (shared allocatePax): `countedPax` /
 * `countedBreakfastPax` are what every total adds up; `paxGroup` marks a booking over several rooms.
 */
export function buildBoardRows(params: {
  rooms: BoardRoom[];
  operations: BoardOperation[];
  /** reservation id -> Little Hotelier Reservation Number */
  references: ReadonlyMap<string, string | null>;
  toursForUnit: ReadonlyMap<string, BoardTour[]>;
}): BoardRow[] {
  const opsByRoom = new Map(params.operations.map((row) => [row.room_id, row]));
  const rows = params.rooms.map((room) => {
    const op = opsByRoom.get(room.id);
    return {
      tours: params.toursForUnit.get(room.unit_code) ?? [],
      rowId: op?.id ?? null,
      roomId: room.id,
      roomLabel: room.display_name,
      roomNumber: room.room_number,
      dorm: room.unit_type === "bunk",
      reservationId: op?.reservation_id ?? null,
      reference: op?.reservation_id ? params.references.get(op.reservation_id) ?? null : null,
      arrivalDate: op?.arrival_date ?? null,
      guestName: op?.guest_name ?? null,
      adults: op?.adults ?? 0,
      children: op?.children ?? 0,
      babies: op?.babies ?? 0,
      totalPax: op?.total_pax ?? 0,
      departureDate: op?.departure_date ?? null,
      operationalStatus: op?.operational_status ?? (room.active ? "available" : "out_of_service"),
      breakfastStatus: op?.breakfast_status ?? "not_included",
      breakfastPax: op?.breakfast_pax ?? 0,
      breakfastToGo: op?.breakfast_to_go ?? false,
      breakfastNotes: op?.breakfast_notes ?? null,
      paymentStatus: op?.payment_status ?? null,
      paymentMethod: op?.payment_method ?? null,
      outstandingBalance: op?.outstanding_balance ?? null,
      currency: (op?.currency ?? null) as BoardRow["currency"],
      carPlate: op?.car_plate ?? null,
      bookingChannel: op?.booking_channel ?? null,
      notes: op?.notes ?? null,
      housekeepingCategory: (op?.housekeeping_category ?? null) as BoardRow["housekeepingCategory"],
      sameDayArrival: op?.same_day_arrival ?? false,
      unitCode: room.unit_code,
      housekeeper: op?.housekeeper ?? null,
      bedSetup: (op?.bed_setup ?? null) as BedSetup | null,
      breakfastToGoTime: op?.breakfast_to_go_time?.slice(0, 5) ?? null
    };
  });
  return withCountedPax(rows);
}

type UncountedRow = Omit<BoardRow, "countedPax" | "countedBreakfastPax" | "paxGroup">;
const boardPaxRow = (row: UncountedRow, pax: number): PaxRow => ({ dorm: row.dorm, pax, reference: row.reference, reservationId: row.reservationId, guestName: row.guestName, arrivalDate: row.arrivalDate, departureDate: row.departureDate });

/** Adds the counted pax and breakfast covers (each booking once) to rows given in board order. */
export function withCountedPax<T extends UncountedRow>(rows: T[]): (T & Pick<BoardRow, "countedPax" | "countedBreakfastPax" | "paxGroup">)[] {
  const guests = allocatePax(rows.map((row) => boardPaxRow(row, row.totalPax)));
  const included = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.breakfastStatus === "included");
  const covers = allocatePax(included.map(({ row }) => boardPaxRow(row, row.breakfastPax)));
  const coversByIndex = new Map(included.map(({ index }, position) => [index, covers[position].pax]));
  return rows.map((row, index) => ({ ...row, countedPax: guests[index].pax, countedBreakfastPax: coversByIndex.get(index) ?? 0, paxGroup: guests[index].group }));
}
