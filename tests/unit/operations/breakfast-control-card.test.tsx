import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { BreakfastControlCard } from "@/features/operations/components/BreakfastControlCard";
import { controlEntries, formatBreakfastControl, freeRooms, summarizeBreakfastControl, type ControlReservation, type ControlUnit } from "@/features/operations/logic/breakfast-control";

const D = "2026-09-30";

const units: ControlUnit[] = [
  ...["1", "2", "3", "8", "11", "12", "14"].map((n, i): ControlUnit => ({ roomId: `r${n}`, roomNumber: n, unitType: "room", parentRoomNumber: null, sortOrder: i + 1, active: true })),
  ...[1, 2, 3, 4, 5, 6].map((n): ControlUnit => ({ roomId: `b${n}`, roomNumber: `B${n}`, unitType: "bunk", parentRoomNumber: "20", sortOrder: 19 + n, active: true }))
];
const reservation = (id: string, roomId: string, over: Partial<ControlReservation> = {}): ControlReservation => ({ id, roomId, guestName: `Guest ${id}`, arrivalDate: "2026-09-28", departureDate: "2026-10-02", adults: 2, children: 0, babies: 0, notes: null, ...over });

const reservations = [
  reservation("a", "r1", { adults: 3 }),
  reservation("b", "r3"),
  reservation("c", "r11", { adults: 2, babies: 1, notes: "Desayuno incluido" }),
  reservation("d", "r14", { departureDate: D, notes: "Breakfast included" }),
  reservation("e", "b1", { adults: 1, guestName: "Tom" }),
  reservation("f", "b2", { adults: 1, guestName: "Eva" }),
  reservation("g", "r2", { departureDate: "2026-09-29" }), // leaves today: not listed
  reservation("h", "r8", { arrivalDate: D }) // arrives on D: not listed
];
const dayRows = [{ roomId: "b1", reservationId: "e", breakfastStatus: "included" as const, breakfastPax: 1, breakfastToGo: true, breakfastToGoTime: "06:30", breakfastNotes: "Sin gluten" }];

const pax = (text: string) => Number(/(\d+) pax/.exec(text)?.[1]);

afterEach(cleanup);

describe("Control de desayunos card vs text", () => {
  it("lists the same rooms and the same two totals", () => {
    const entries = controlEntries({ date: D, units, reservations, dayRows, previousDayRows: [] });
    const summary = summarizeBreakfastControl({ entries, free: freeRooms(units, entries) });
    const text = formatBreakfastControl({ date: D, summary });
    render(<BreakfastControlCard date={D} summary={summary} locale="es" />);

    // Rooms: the first field of each guest line in the text vs the card rows, in order.
    const textLines = text.split("\n");
    const textRooms = textLines.slice(2, textLines.findIndex((line) => line.startsWith("Libres:"))).map((line) => line.split(" · ")[0]);
    const cardRooms = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(textRooms).toEqual(["1", "3", "11", "14", "20 camas"]);
    expect(cardRooms).toEqual(textRooms);

    // Free rooms.
    expect(textLines).toContain("Libres: 2, 8, 12");
    expect(screen.getByTestId("control-free").textContent).toBe("Libres: 2, 8, 12");

    // Totals: guests in the hotel, and included covers + rooms.
    const guestsLine = textLines.find((line) => line.startsWith("Total huéspedes en el hotel:"))!;
    const includedLine = textLines.find((line) => line.startsWith("Con desayuno incluido:"))!;
    expect(guestsLine).toBe("Total huéspedes en el hotel: 12 pax");
    expect(includedLine).toBe("Con desayuno incluido: 5 pax (3 hab.)");
    expect(pax(screen.getByTestId("control-guests").textContent!)).toBe(pax(guestsLine));
    expect(screen.getByTestId("control-included").textContent).toContain(`${pax(includedLine)} pax (3 hab.)`);
  });

  it("empty day: no rooms and zero totals on both", () => {
    const summary = summarizeBreakfastControl({ entries: [], free: [] });
    const text = formatBreakfastControl({ date: D, summary });
    render(<BreakfastControlCard date={D} summary={summary} locale="es" />);
    expect(screen.queryAllByRole("row").filter((row) => row.hasAttribute("data-room"))).toHaveLength(0);
    expect(text).toContain("Sin huéspedes para el desayuno.");
    expect(screen.getByText("Sin huéspedes para el desayuno.")).toBeInTheDocument();
    expect(screen.getByTestId("control-free").textContent).toBe("Libres: ninguna");
    expect(pax(screen.getByTestId("control-guests").textContent!)).toBe(0);
    expect(screen.getByTestId("control-included").textContent).toContain("0 pax (0 hab.)");
  });
});
