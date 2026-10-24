import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { buildBoardRows, type BoardOperation, type BoardRoom } from "@/features/operations/logic/board-rows";
import { allocatePax, splitPaxWarning, totalPax } from "@/features/operations/logic/pax";
import { controlEntries, formatBreakfastControl, formatBreakfastControlWhatsApp, freeRooms, summarizeBreakfastControl, type ControlReservation, type ControlUnit } from "@/features/operations/logic/breakfast-control";
import { breakfastReportTotal, formatBreakfastReport } from "@/features/operations/logic/breakfast-report";
import { summarizeBoardSheet } from "@/features/operations/logic/board-sheet";
import { RoomBoardTable } from "@/features/operations/components/RoomBoardTable";
import { BreakfastControlCard } from "@/features/operations/components/BreakfastControlCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/features/operations/actions", () => ({ getRowHistory: vi.fn(), moveGuest: vi.fn(), swapRooms: vi.fn(), updateOperationCell: vi.fn() }));
vi.mock("@/features/records/components/RegisterForms", () => ({ TourBookingDialog: () => null }));
afterEach(cleanup);

/**
 * A Little Hotelier reservation over several rooms carries its TOTAL pax on every room row
 * (Marlon Camacho Rodriguez: 5 pax, rooms 14 and 18). Until staff split it, it counts once,
 * on its first room, with a warning on each of its rooms; Room 20 beds of one booking count once.
 */
const D = "2026-10-23";
const MARLON = { reference: "LH-555", guest: "Camacho Rodriguez, Marlon", arrival: "2026-10-21", departure: "2026-10-25" };

const roomNumbers = ["3", "14", "18", "19"];
const rooms: BoardRoom[] = [
  ...roomNumbers.map((n) => ({ id: `r${n}`, display_name: `Room ${n}`, room_number: n, unit_code: n, unit_type: "room", active: true })),
  ...[1, 2, 3, 4].map((n) => ({ id: `b${n}`, display_name: `Bed ${n}`, room_number: "20", unit_code: `B${n}`, unit_type: "bunk", active: true }))
];
const op = (roomId: string, reservationId: string, guest: string, pax: number, over: Partial<BoardOperation> = {}): BoardOperation => ({
  id: `op-${roomId}`, room_id: roomId, reservation_id: reservationId, guest_name: guest, arrival_date: MARLON.arrival, adults: pax, children: 0, babies: 0,
  total_pax: pax, departure_date: MARLON.departure, operational_status: "staying", breakfast_status: "included", breakfast_pax: pax, breakfast_to_go: false,
  breakfast_notes: null, payment_status: null, payment_method: null, outstanding_balance: null, currency: null, car_plate: null, booking_channel: null,
  notes: null, housekeeping_category: null, same_day_arrival: false, housekeeper: null, bed_setup: null, breakfast_to_go_time: null, ...over
});
const board = (operations: BoardOperation[], references: Record<string, string | null>) =>
  buildBoardRows({ rooms, operations, references: new Map(Object.entries(references)), toursForUnit: new Map() });

// Marlon: one reservation, rooms 14 and 18, 5 pax on each row. A dorm booking of 4 pax on B1-B4.
const marlonOps = [op("r14", "res-14", MARLON.guest, 5), op("r18", "res-18", MARLON.guest, 5)];
const dormOps = [1, 2, 3, 4].map((n) => op(`b${n}`, `res-b${n}`, "Becker, Tom", 4));
const marlonRefs = { "res-14": MARLON.reference, "res-18": MARLON.reference, "res-b1": "LH-77", "res-b2": "LH-77", "res-b3": "LH-77", "res-b4": "LH-77" };

describe("a reservation over several rooms (no split yet)", () => {
  it("counts its 5 pax once, on the first room; the other room counts 0; both carry the warning", () => {
    const rows = board(marlonOps, marlonRefs);
    const r14 = rows.find((row) => row.unitCode === "14")!;
    const r18 = rows.find((row) => row.unitCode === "18")!;
    expect([r14.countedPax, r18.countedPax]).toEqual([5, 0]);
    expect([r14.countedBreakfastPax, r18.countedBreakfastPax]).toEqual([5, 0]);
    expect(splitPaxWarning(r14.paxGroup, true)).toBe("Reserva en 2 habitaciones – repartir pax");
    expect(splitPaxWarning(r18.paxGroup, true)).toBe("Reserva en 2 habitaciones – repartir pax");
    expect(rows.reduce((sum, row) => sum + row.countedPax, 0)).toBe(5);
  });

  it("the Room board shows the counted pax and the warning on both rooms", () => {
    render(<RoomBoardTable rows={board(marlonOps, marlonRefs)} rooms={[]} locale="es" />);
    const row = (label: string) => screen.getAllByRole("row").find((r) => within(r).queryByText(label))!;
    const paxCell = (label: string) => within(row(label)).getAllByRole("cell")[2];
    expect(paxCell("Room 14").textContent).toBe("5Reserva en 2 habitaciones – repartir pax");
    expect(paxCell("Room 18").textContent).toBe("—Contado en Room 14Reserva en 2 habitaciones – repartir pax");
    expect(paxCell("Room 3").textContent).toBe("—");
  });

  it("breakfast card, text and WhatsApp: 5 included, not 10; the board total is the same", () => {
    const units: ControlUnit[] = rooms.map((room, index) => ({ roomId: room.id, roomNumber: room.unit_type === "bunk" ? room.unit_code : room.room_number, unitType: room.unit_type as "room" | "bunk", parentRoomNumber: room.unit_type === "bunk" ? "20" : null, sortOrder: index + 1, active: true }));
    const reservations: ControlReservation[] = ["r14", "r18"].map((roomId) => ({ id: `res-${roomId.slice(1)}`, reference: MARLON.reference, roomId, guestName: MARLON.guest, arrivalDate: MARLON.arrival, departureDate: MARLON.departure, adults: 5, children: 0, babies: 0, notes: "Desayuno incluido" }));
    const entries = controlEntries({ date: D, units, reservations, dayRows: [], previousDayRows: [] });
    const summary = summarizeBreakfastControl({ entries, free: freeRooms(units, entries) });
    expect(summary.lines.map((line) => [line.label, line.pax, line.breakfastPax, line.stayNote])).toEqual([
      ["14", 5, 5, "Reserva en 14 + 18: repartir pax"],
      ["18", 0, 0, "Misma reserva que 14"]
    ]);
    expect(summary).toMatchObject({ guests: 5, includedPax: 5 });
    const text = formatBreakfastControl({ date: D, summary });
    expect(text).toContain("14 · Marlon Camacho Rodriguez · 5 pax · ✅ DESAYUNO INCLUIDO · Reserva en 14 + 18: repartir pax");
    expect(text).toContain("Con desayuno incluido: 5 pax");
    expect(formatBreakfastControlWhatsApp({ date: D, summary })).toContain("*Con desayuno incluido: 5 pax (2 hab.)*");

    render(<BreakfastControlCard date={D} generatedAt={new Date("2026-10-22T18:00:00Z")} summary={summary} />);
    expect(screen.getByTestId("control-included").textContent).toBe("5");
    expect(screen.getByText("Misma reserva que 14")).toBeInTheDocument();

    const boardRows = board(marlonOps, marlonRefs);
    expect(boardRows.reduce((sum, row) => sum + row.countedBreakfastPax, 0)).toBe(summary.includedPax);
    expect(boardRows.reduce((sum, row) => sum + row.countedPax, 0)).toBe(summary.guests);
  });

  it("Reporte de desayuno merges the two rooms into one line with 5 covers", () => {
    const rows = marlonOps.map((row) => ({ room: row.room_id === "r14" ? "Room 14" : "Room 18", guest: row.guest_name, pax: row.breakfast_pax, toGo: false, notes: null, dorm: false, reference: MARLON.reference, reservationId: row.reservation_id, arrivalDate: row.arrival_date, departureDate: row.departure_date }));
    expect(breakfastReportTotal(rows)).toBe(5);
    expect(formatBreakfastReport({ es: true, dateLabel: "viernes", rows })).toContain("Room 14, Room 18 · Camacho Rodriguez, Marlon · 5 pax");
  });

  it("the printed board counts it once and prints the warning", () => {
    const summary = summarizeBoardSheet(board(marlonOps, marlonRefs));
    expect(summary.pax).toBe(5);
    expect(summary.lines.find((line) => line.label === "18")?.statusNotes).toContain("Reserva en 2 habitaciones – repartir pax");
  });
});

describe("Nichola Carter in rooms 3 and 19 (2 pax on each row)", () => {
  const carter = (references: Record<string, string>) => board([op("r3", "res-3", "Carter, Nichola", 2), op("r19", "res-19", "Carter, Nichola", 2)], references);
  it("one reservation over both rooms: 2 pax, with the warning", () => {
    const rows = carter({ "res-3": "BDC-1", "res-19": "BDC-1" });
    expect(rows.reduce((sum, row) => sum + row.countedPax, 0)).toBe(2);
    expect(rows.find((row) => row.unitCode === "19")?.paxGroup?.size).toBe(2);
  });
  it("two separate reservations under the same name: 4 pax, no warning", () => {
    const rows = carter({ "res-3": "BDC-1", "res-19": "BDC-2" });
    expect(rows.reduce((sum, row) => sum + row.countedPax, 0)).toBe(4);
    expect(rows.every((row) => row.paxGroup === null)).toBe(true);
  });
});

describe("unchanged cases", () => {
  it("dorm: 4 pax over 4 beds counts 4, without the split warning", () => {
    const rows = board(dormOps, marlonRefs);
    expect(rows.reduce((sum, row) => sum + row.countedPax, 0)).toBe(4);
    expect(rows.filter((row) => row.dorm).every((row) => row.paxGroup?.dorm && splitPaxWarning(row.paxGroup, true) === null)).toBe(true);
  });
  it("normal rooms each count their own pax", () => {
    const rows = board([op("r3", "res-3", "Ana Mora", 2, { arrival_date: "2026-10-22" }), op("r19", "res-19", "Luis Solís", 3)], { "res-3": "LH-1", "res-19": "LH-2" });
    expect(rows.map((row) => row.countedPax).filter(Boolean)).toEqual([2, 3]);
    expect(rows.every((row) => row.paxGroup === null)).toBe(true);
  });
  it("totalPax is the sum of allocatePax", () => {
    const paxRows = [{ dorm: false, pax: 5, reference: "LH-555", arrivalDate: MARLON.arrival }, { dorm: false, pax: 5, reference: "LH-555", arrivalDate: MARLON.arrival }, { dorm: false, pax: 2 }];
    expect(allocatePax(paxRows).map((row) => row.pax)).toEqual([5, 0, 2]);
    expect(totalPax(paxRows)).toBe(7);
  });
});
