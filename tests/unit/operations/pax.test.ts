import { describe, it, expect } from "vitest";
import { operationPaxRow, totalPax, type PaxRow } from "@/features/operations/logic/pax";
import { controlEntries, formatBreakfastControl, formatBreakfastControlWhatsApp, freeRooms, summarizeBreakfastControl, type ControlReservation, type ControlUnit } from "@/features/operations/logic/breakfast-control";
import { breakfastReportTotal, formatBreakfastReport } from "@/features/operations/logic/breakfast-report";

// Breakfast on D; the dorm booking LH-77 (4 pax) holds B1-B4, imported as one reservation row per bed.
const D = "2026-10-20";
const bed = (n: number): ControlUnit => ({ roomId: `b${n}`, roomNumber: `B${n}`, unitType: "bunk", parentRoomNumber: "20", sortOrder: 19 + n, active: true });
const room = (n: number): ControlUnit => ({ roomId: `r${n}`, roomNumber: String(n), unitType: "room", parentRoomNumber: null, sortOrder: n, active: true });
const units = [room(1), room(2), ...[1, 2, 3, 4, 5, 6].map(bed)];
const res = (over: Partial<ControlReservation> & Pick<ControlReservation, "id" | "roomId">): ControlReservation => ({ reference: null, guestName: "Mora, Ana", arrivalDate: "2026-10-18", departureDate: "2026-10-22", adults: 2, children: 0, babies: 0, notes: null, ...over });
const dormBooking = [1, 2, 3, 4].map((n) => res({ id: `res-b${n}`, roomId: `b${n}`, reference: "LH-77", guestName: "Becker, Tom", adults: 4, notes: "Breakfast included" }));

const summarize = (reservations: ControlReservation[]) => {
  const entries = controlEntries({ date: D, units, reservations, dayRows: [], previousDayRows: [] });
  return summarizeBreakfastControl({ entries, free: freeRooms(units, entries) });
};

describe("totalPax", () => {
  it("(a) one dorm booking of 4 pax across 4 beds counts 4", () => {
    const rows: PaxRow[] = [1, 2, 3, 4].map((n) => ({ dorm: true, pax: 4, reservationId: `res-b${n}`, reference: "LH-77", arrivalDate: "2026-10-18", departureDate: "2026-10-22" }));
    expect(totalPax(rows)).toBe(4);
  });

  it("(a) without a reference, the same guest and dates is the same booking", () => {
    const rows: PaxRow[] = [1, 2, 3, 4].map((n) => ({ dorm: true, pax: 4, reservationId: `res-b${n}`, guestName: "Becker, Tom", arrivalDate: "2026-10-18", departureDate: "2026-10-22" }));
    expect(totalPax(rows)).toBe(4);
  });

  it("(b) two dorm bookings of 2 and 1 pax in different beds count 3", () => {
    expect(totalPax([
      { dorm: true, pax: 2, reference: "LH-1", guestName: "Eva", arrivalDate: "2026-10-18", departureDate: "2026-10-21" },
      { dorm: true, pax: 2, reference: "LH-1", guestName: "Eva", arrivalDate: "2026-10-18", departureDate: "2026-10-21" },
      { dorm: true, pax: 1, reference: "LH-2", guestName: "Tom", arrivalDate: "2026-10-18", departureDate: "2026-10-21" }
    ])).toBe(3);
  });

  it("(c) normal rooms are summed row by row, even with the same reference", () => {
    expect(totalPax([
      { dorm: false, pax: 2, reference: "LH-9", arrivalDate: "2026-10-18" },
      { dorm: false, pax: 2, reference: "LH-9", arrivalDate: "2026-10-18" },
      { dorm: false, pax: 3 }
    ])).toBe(7);
  });

  it("dorm rows with nothing to match on still count each", () => {
    expect(totalPax([{ dorm: true, pax: 1 }, { dorm: true, pax: 1 }])).toBe(2);
  });
});

describe("breakfast control with the dorm", () => {
  it("(a) lists '20 camas' once with 4 pax, in the card summary, text and WhatsApp", () => {
    const summary = summarize(dormBooking);
    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]).toMatchObject({ label: "20 camas", pax: 4, included: true, breakfastPax: 4 });
    expect(summary).toMatchObject({ guests: 4, includedPax: 4, includedRooms: 1 });
    expect(formatBreakfastControl({ date: D, summary })).toContain("20 camas · Tom Becker · 4 pax · ✅ DESAYUNO INCLUIDO\n");
    expect(formatBreakfastControlWhatsApp({ date: D, summary })).toContain("*Total huéspedes en el hotel: 4 pax*");
  });

  it("(b) two dorm bookings of 2 and 1 pax make 3", () => {
    const summary = summarize([
      res({ id: "x1", roomId: "b1", reference: "LH-1", guestName: "Eva", adults: 2 }),
      res({ id: "x2", roomId: "b2", reference: "LH-1", guestName: "Eva", adults: 2 }),
      res({ id: "x3", roomId: "b3", reference: "LH-2", guestName: "Tom", adults: 1 })
    ]);
    expect(summary.lines[0]).toMatchObject({ label: "20 camas", names: ["Eva", "Tom"], pax: 3 });
    expect(summary.guests).toBe(3);
  });

  it("(c) normal rooms are unchanged", () => {
    const summary = summarize([res({ id: "n1", roomId: "r1", adults: 2 }), res({ id: "n2", roomId: "r2", adults: 2, children: 1 }), ...dormBooking]);
    expect(summary.lines.map((line) => [line.label, line.pax])).toEqual([["1", 2], ["2", 3], ["20 camas", 4]]);
    expect(summary.guests).toBe(9);
  });

  it("(d) breakfast totals match the room board total for the same stays", () => {
    const reservations = [res({ id: "n1", roomId: "r1", adults: 2, notes: "Breakfast included" }), res({ id: "n2", roomId: "r2", adults: 3 }), ...dormBooking];
    const summary = summarize(reservations);
    // The board's daily_operations rows: one per unit, the dorm booking repeated on B1-B4.
    const boardRows = reservations.map((r) => ({ room_id: r.roomId, reservation_id: r.id, guest_name: r.guestName, arrival_date: r.arrivalDate, departure_date: r.departureDate, total_pax: r.adults + r.children + r.babies, breakfast_pax: r.notes ? r.adults + r.children : 0 }));
    const dorm = (roomId: string) => roomId.startsWith("b");
    expect(totalPax(boardRows.map((row) => operationPaxRow(row, dorm(row.room_id), row.total_pax)))).toBe(summary.guests);
    expect(totalPax(boardRows.map((row) => operationPaxRow(row, dorm(row.room_id), row.breakfast_pax)))).toBe(summary.includedPax);
    expect(summary).toMatchObject({ guests: 9, includedPax: 6 });
  });
});

describe("Reporte de desayuno with the dorm", () => {
  it("merges the beds of one booking into one line and counts its covers once", () => {
    const rows = [
      { room: "1", guest: "Ana", pax: 2, toGo: false, notes: null },
      ...[1, 2, 3, 4].map((n) => ({ room: `B${n}`, guest: "Becker, Tom", pax: 4, toGo: n === 2, notes: null, dorm: true, reservationId: `res-b${n}`, arrivalDate: "2026-10-18", departureDate: "2026-10-22" }))
    ];
    expect(breakfastReportTotal(rows)).toBe(6);
    const text = formatBreakfastReport({ es: true, dateLabel: "martes", rows });
    expect(text).toContain("B1, B2, B3, B4 · Becker, Tom · 4 pax · Para llevar");
    expect(text).toContain("Total: 6 pax");
  });
});
