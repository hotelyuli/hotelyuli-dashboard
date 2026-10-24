import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import type { RetirementCandidate } from "@/features/operations/services/retirement";
import { clearInactiveOperations, inactiveNote, withActiveReservations, type InactiveReservation } from "@/features/operations/services/active-reservations";
import { boardOccupancy, buildBoardRows, pendingBalances, type BoardOperation, type BoardRoom } from "@/features/operations/logic/board-rows";
import { seenFromImport } from "@/features/csv-import/logic/import-seen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/features/operations/actions", () => ({ getRowHistory: vi.fn(), moveGuest: vi.fn(), swapRooms: vi.fn(), updateOperationCell: vi.fn() }));
vi.mock("@/features/records/components/RegisterForms", () => ({ TourBookingDialog: () => null }));
const confirmImportRetirement = vi.fn();
vi.mock("@/features/csv-import/actions", () => ({ confirmImportRetirement: (...args: unknown[]) => confirmImportRetirement(...args) }));
const { RoomBoardTable } = await import("@/features/operations/components/RoomBoardTable");
const { RetirementNotice, TICK_ORDINARY_CANDIDATES_BY_DEFAULT } = await import("@/features/csv-import/components/RetirementNotice");
afterEach(cleanup);

const rooms: BoardRoom[] = ["5", "6", "7", "14"].map((n) => ({ id: `r${n}`, display_name: `Room ${n}`, room_number: n, unit_code: n, unit_type: "room", active: true }));
const op = (roomId: string, reservationId: string, over: Partial<BoardOperation> = {}): BoardOperation => ({
  id: `op-${roomId}`, room_id: roomId, reservation_id: reservationId, guest_name: "Guest", arrival_date: "2026-10-24", adults: 2, children: 0, babies: 0, total_pax: 2,
  departure_date: "2026-10-26", operational_status: "check_in", breakfast_status: "included", breakfast_pax: 2, breakfast_to_go: false, breakfast_notes: null,
  payment_status: "pending", payment_method: null, outstanding_balance: 100, currency: "USD", car_plate: null, booking_channel: null, notes: null,
  housekeeping_category: null, same_day_arrival: false, housekeeper: null, bed_setup: null, breakfast_to_go_time: null, ...over
});
const inactive = new Map<string, InactiveReservation>([
  ["res-7", { guest: "Umaña Ortega, Nicole", reason: "moved_in_lh", lhRoom: "Room 4" }],
  ["res-14", { guest: "Bloom, Jeramie", reason: "missing_from_import", lhRoom: null }]
]);
const operations = [
  op("r5", "res-w5", { guest_name: "Weber, Max", operational_status: "staying", outstanding_balance: 60 }),
  op("r6", "res-w6", { guest_name: "Weber, Max", operational_status: "staying", outstanding_balance: 60 }),
  op("r7", "res-7", { guest_name: "Umaña Ortega, Nicole" }),
  op("r14", "res-14", { guest_name: "Bloom, Jeramie", outstanding_balance: 50.33 })
];
const references = new Map([["res-w5", "LH-W"], ["res-w6", "LH-W"], ["res-7", "LH-U"], ["res-14", "LH-B"]]);

describe("shared active-reservations selector", () => {
  it("before migration 0032 (no view) it reads reservations; with the view it reads the view", async () => {
    const tables: string[] = [];
    const missing = { error: { code: "PGRST205" } };
    const ok = { error: null, data: [] };
    expect(await withActiveReservations(async (table) => { tables.push(table); return tables.length === 1 ? missing : ok; })).toBe(ok);
    expect(tables).toEqual(["active_reservations", "reservations"]);
    tables.length = 0;
    await withActiveReservations(async (table) => { tables.push(table); return ok; });
    expect(tables).toEqual(["active_reservations"]);
  });

  it("rows of reservations that no longer count become free rooms with a note; others are untouched", () => {
    const { operations: cleared, notes } = clearInactiveOperations(operations, inactive);
    expect(cleared.map((row) => [row.room_id, row.guest_name, row.total_pax, row.outstanding_balance, row.operational_status, row.breakfast_status])).toEqual([
      ["r5", "Weber, Max", 2, 60, "staying", "included"],
      ["r6", "Weber, Max", 2, 60, "staying", "included"],
      ["r7", null, 0, null, "available", "not_included"],
      ["r14", null, 0, null, "available", "not_included"]
    ]);
    expect([...notes.keys()]).toEqual(["op-r7", "op-r14"]);
    expect(inactiveNote(inactive.get("res-7")!, true)).toBe("Movida en Little Hotelier a Room 4 (Umaña Ortega, Nicole) – revisar");
    expect(inactiveNote(inactive.get("res-14")!, true)).toBe("Reserva retirada: no está en Little Hotelier (Bloom, Jeramie)");
  });

  it("dashboard numbers from the board: pending once per booking, stale rows left out; occupancy", () => {
    const board = buildBoardRows({ rooms, operations, references, toursForUnit: new Map(), inactive });
    expect(pendingBalances(board)).toEqual({ USD: 60, CRC: 0, bookings: 1 });
    expect(boardOccupancy(board)).toEqual({ occupied: 2, capacity: 4, available: 2, percent: 50 });
    const withoutSelector = buildBoardRows({ rooms, operations, references, toursForUnit: new Map() });
    expect(pendingBalances(withoutSelector)).toEqual({ USD: 210.33, CRC: 0, bookings: 3 });
  });

  it("the Room board shows the stale rooms free, with the note", () => {
    render(<RoomBoardTable rows={buildBoardRows({ rooms, operations, references, toursForUnit: new Map(), inactive })} rooms={[]} locale="es" />);
    const guestCell = (label: string) => within(screen.getAllByRole("row").find((row) => within(row).queryByText(label))!).getAllByRole("cell")[1];
    expect(guestCell("Room 7").textContent).toBe("—Movida en Little Hotelier a Room 4 (Umaña Ortega, Nicole) – revisar");
    expect(guestCell("Room 14").textContent).toBe("—Reserva retirada: no está en Little Hotelier (Bloom, Jeramie)");
    expect(guestCell("Room 5").textContent).toBe("Weber, Max");
  });

  it("what a file lists: date, reference and resolved room, per room of a multi-room line", () => {
    const headers = ["Reservation Number", "Guest Name", "Check In", "LoS", "Room Number", "Adults / Children / Infants"];
    const rows = [{ "Reservation Number": " LH-M ", "Guest Name": "Camacho, Marlon", "Check In": "24-10-2026", LoS: "3", "Room Number": "Room 14,Room 18", "Adults / Children / Infants": "4 / 1 / 0" }];
    expect(seenFromImport(rows, headers, "check_in", new Map([["14", "r14"], ["18", "r18"]]))).toEqual({ invalidRows: 0, seen: [
      { date: "2026-10-24", reference: "LH-M", guest: "Camacho, Marlon", room_id: "r14" },
      { date: "2026-10-24", reference: "LH-M", guest: "Camacho, Marlon", room_id: "r18" }
    ] });
  });

  it("rule 3: an unresolved or unknown room marks the line's date incomplete (room_id null); an unreadable line is counted", () => {
    const headers = ["Reservation Number", "Guest Name", "Check In", "LoS", "Room Number"];
    const line = (room: string, date = "24-10-2026") => ({ "Reservation Number": "LH-1", "Guest Name": "Ana", "Check In": date, LoS: "1", "Room Number": room });
    const map = new Map([["5", "r5"]]);
    expect(seenFromImport([line("Room 5,Suite Azul")], headers, "check_in", map).seen).toEqual([{ date: "2026-10-24", reference: "LH-1", guest: "Ana", room_id: "r5" }, { date: "2026-10-24", reference: "LH-1", guest: "Ana", room_id: null }]);
    expect(seenFromImport([line("Room 6")], headers, "check_in", map).seen).toEqual([{ date: "2026-10-24", reference: "LH-1", guest: "Ana", room_id: null }]);
    expect(seenFromImport([line("Room 5", "mañana")], headers, "check_in", map)).toEqual({ seen: [], invalidRows: 1 });
  });
});

describe("import confirmation list (RetirementNotice)", () => {
  const candidate = (over: Partial<RetirementCandidate>): RetirementCandidate => ({ reservation_id: "id", date: "2026-10-24", room: "Room 9", guest: "Pérez, Juan", reference: "LH-P", kind: "missing_from_import", lh_room: null, has_payment: false, lh_paid: false, may_be_extended: false, ...over });
  it("every row starts unticked; money in YuliOS is red; 'Pagado (LH)' is only a chip; Confirmar sends exactly the ticked ids", async () => {
    confirmImportRetirement.mockResolvedValue({ ok: true });
    render(<RetirementNotice importId="imp-1" es result={{ status: "needs_confirmation", skipped_dates: [{ date: "2026-10-25", reason: "unresolved_room" }], candidates: [
      candidate({ reservation_id: "a", room: "Room 9" }),
      candidate({ reservation_id: "b", room: "Room 14", guest: "Bloom, Jeramie", has_payment: true }),
      candidate({ reservation_id: "c", room: "Room 7", guest: "Quirós, Ana", may_be_extended: true }),
      candidate({ reservation_id: "d", room: "Room 10", guest: "Prepaid, Expedia", lh_paid: true })
    ] }} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(TICK_ORDINARY_CANDIDATES_BY_DEFAULT).toBe(false);
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([false, false, false, false]);
    expect(screen.getByRole("button", { name: "Confirmar (0 seleccionadas)" })).toBeDisabled();
    expect(screen.getByText(/Tiene dinero registrado en YuliOS/).closest("li")).toHaveClass("has-payment");
    expect(screen.getByText("Pagado (LH)").closest("li")).not.toHaveClass("has-payment");
    expect(screen.getByText(/Puede haberse extendido en Little Hotelier/)).toBeInTheDocument();
    expect(screen.getByText("25/10: una habitación del archivo no se reconoció; no se retira nada de ese día.")).toBeInTheDocument();
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[3]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar (3 seleccionadas)" }));
    await vi.waitFor(() => expect(confirmImportRetirement).toHaveBeenCalledWith("imp-1", ["a", "d", "b"]));
  });
});
