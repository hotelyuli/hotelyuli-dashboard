import { describe, it, expect } from "vitest";
import { addDays, controlEntries, eatsBreakfastOn, formatBreakfastControl, freeRooms, type ControlEntry, type ControlReservation, type ControlUnit } from "@/features/operations/logic/breakfast-control";

// Breakfast date D = Wednesday 30/09/2026; "today" (the day the list is sent) = 29/09.
const D = "2026-09-30";
const TODAY = "2026-09-29";

const entry = (over: Partial<ControlEntry>): ControlEntry => ({ room: "1", beds: false, sortOrder: 1, guestName: "Ana Mora", pax: 2, breakfastIncluded: false, breakfastPax: 0, toGo: false, toGoTime: null, notes: null, ...over });
const lines = (text: string) => text.split("\n");

describe("formatBreakfastControl", () => {
  it("empty day", () => {
    expect(formatBreakfastControl({ date: D, entries: [], free: 20 })).toBe([
      "Control de desayunos · mié 30/09/2026",
      "",
      "Sin huéspedes para el desayuno.",
      "Libres: 20",
      "",
      "Total huéspedes en el hotel: 0 pax",
      "Con desayuno incluido: 0 pax (0 hab.)"
    ].join("\n"));
  });

  it("normal day, sorted by room order", () => {
    const text = formatBreakfastControl({ date: D, free: 18, entries: [
      entry({ room: "3", sortOrder: 3, guestName: "Luis Rojas", pax: 2 }),
      entry({ room: "1", sortOrder: 1, guestName: "Ana Mora", pax: 3 })
    ] });
    expect(lines(text).slice(0, 5)).toEqual([
      "Control de desayunos · mié 30/09/2026",
      "",
      "1 · Ana Mora · 3 pax",
      "3 · Luis Rojas · 2 pax",
      "Libres: 18"
    ]);
  });

  it("merges Room 20 with two beds into one line", () => {
    const text = formatBreakfastControl({ date: D, free: 19, entries: [
      entry({ room: "20", beds: true, sortOrder: 21, guestName: "Tom", pax: 1 }),
      entry({ room: "20", beds: true, sortOrder: 20, guestName: "Eva", pax: 1 })
    ] });
    expect(lines(text)).toContain("20 (camas) · Tom / Eva · 2 pax");
    expect(text.match(/^20 /gm)).toHaveLength(1);
  });

  it("to-go shows the earliest time, or none when unset", () => {
    const text = formatBreakfastControl({ date: D, free: 0, entries: [
      entry({ room: "20", beds: true, sortOrder: 20, guestName: "Tom", pax: 1, toGo: true, toGoTime: "07:15:00" }),
      entry({ room: "20", beds: true, sortOrder: 21, guestName: "Eva", pax: 1, toGo: true, toGoTime: "06:30:00" }),
      entry({ room: "5", sortOrder: 5, guestName: "Ana", pax: 2, toGo: true })
    ] });
    expect(lines(text)).toContain("20 (camas) · Tom / Eva · 2 pax · 🥡 para llevar 06:30");
    expect(lines(text)).toContain("5 · Ana · 2 pax · 🥡 para llevar");
  });

  it("marks an included room, with covers when a baby does not eat, and notes", () => {
    const text = formatBreakfastControl({ date: D, free: 0, entries: [
      entry({ room: "11", sortOrder: 11, guestName: "Dana Levi", pax: 3, breakfastIncluded: true, breakfastPax: 3, notes: "Sin gluten" }),
      entry({ room: "14", sortOrder: 14, guestName: "Kim Park", pax: 3, breakfastIncluded: true, breakfastPax: 2 })
    ] });
    expect(lines(text)).toContain("11 · Dana Levi · 3 pax · ✅ DESAYUNO INCLUIDO · 📝 Sin gluten");
    expect(lines(text)).toContain("14 · Kim Park · 3 pax · ✅ DESAYUNO INCLUIDO (2 pax)");
  });

  it("totals: all listed guests, included covers and rooms (Room 20 counts once); no currencies", () => {
    const text = formatBreakfastControl({ date: D, free: 2, entries: [
      entry({ room: "1", sortOrder: 1, pax: 3 }),
      entry({ room: "11", sortOrder: 11, pax: 3, breakfastIncluded: true, breakfastPax: 3 }),
      entry({ room: "14", sortOrder: 14, pax: 2, breakfastIncluded: true, breakfastPax: 2 }),
      entry({ room: "20", beds: true, sortOrder: 20, guestName: "Tom", pax: 1, breakfastIncluded: true, breakfastPax: 1 }),
      entry({ room: "20", beds: true, sortOrder: 21, guestName: "Eva", pax: 1, breakfastIncluded: true, breakfastPax: 1 })
    ] });
    expect(lines(text).slice(-2)).toEqual(["Total huéspedes en el hotel: 10 pax", "Con desayuno incluido: 7 pax (3 hab.)"]);
    expect(text).not.toMatch(/CRC|USD|₡|\$/);
  });
});

describe("who eats breakfast on D (arrival < D <= departure)", () => {
  const stay = (arrivalDate: string, departureDate: string) => ({ arrivalDate, departureDate });
  it("excludes a guest departing today", () => expect(eatsBreakfastOn(stay("2026-09-27", TODAY), D)).toBe(false));
  it("includes a guest arriving today", () => expect(eatsBreakfastOn(stay(TODAY, "2026-10-02"), D)).toBe(true));
  it("includes a guest departing on D", () => expect(eatsBreakfastOn(stay("2026-09-28", D), D)).toBe(true));
  it("excludes a guest arriving on D", () => expect(eatsBreakfastOn(stay(D, "2026-10-03"), D)).toBe(false));
  it("D defaults to the day after today", () => expect(addDays(TODAY, 1)).toBe(D));
});

describe("controlEntries field sources", () => {
  const units: ControlUnit[] = [
    { roomId: "r1", roomNumber: "1", unitType: "room", parentRoomNumber: null, sortOrder: 1, active: true },
    { roomId: "r2", roomNumber: "2", unitType: "room", parentRoomNumber: null, sortOrder: 2, active: true },
    { roomId: "b1", roomNumber: "B1", unitType: "bunk", parentRoomNumber: "20", sortOrder: 20, active: true },
    { roomId: "b2", roomNumber: "B2", unitType: "bunk", parentRoomNumber: "20", sortOrder: 21, active: true }
  ];
  const reservation = (over: Partial<ControlReservation>): ControlReservation => ({ id: "x", roomId: "r1", guestName: "Ana", arrivalDate: TODAY, departureDate: "2026-10-02", adults: 2, children: 0, babies: 0, notes: null, ...over });
  const row = { roomId: "r1", reservationId: "a", breakfastStatus: "included" as const, breakfastPax: 2, breakfastToGo: true, breakfastToGoTime: "06:30", breakfastNotes: "Vegano" };

  it("uses D's row first, then the previous day's row, then the reservation notes", () => {
    const entries = controlEntries({
      date: D,
      units,
      reservations: [
        reservation({ id: "a", roomId: "r1" }),
        reservation({ id: "b", roomId: "r2", notes: "Desayuno incluido" }),
        reservation({ id: "c", roomId: "b1", notes: "Desayuno incluido", adults: 1 })
      ],
      dayRows: [{ ...row, breakfastToGoTime: "07:00", breakfastNotes: null }],
      previousDayRows: [row, { ...row, roomId: "r2", reservationId: "b", breakfastStatus: "not_included", breakfastPax: 0, breakfastToGo: false, breakfastToGoTime: null }]
    });
    expect(entries.find((e) => e.room === "1")).toMatchObject({ breakfastIncluded: true, toGoTime: "07:00", notes: null });
    expect(entries.find((e) => e.room === "2")).toMatchObject({ breakfastIncluded: false, toGo: false, notes: "Vegano" });
    expect(entries.find((e) => e.room === "20")).toMatchObject({ beds: true, breakfastIncluded: true, breakfastPax: 1, toGo: false, toGoTime: null, notes: null });
    expect(freeRooms(units, entries)).toBe(0);
  });

  it("counts rooms with nobody listed as free, Room 20 as one room", () => {
    const entries = controlEntries({ date: D, units, reservations: [reservation({ roomId: "r1" }), reservation({ id: "y", roomId: "b2", arrivalDate: D })], dayRows: [], previousDayRows: [] });
    expect(entries.map((e) => e.room)).toEqual(["1"]);
    expect(freeRooms(units, entries)).toBe(2);
  });
});
