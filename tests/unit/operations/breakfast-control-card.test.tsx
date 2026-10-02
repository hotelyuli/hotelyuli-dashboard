import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { BreakfastControlCard } from "@/features/operations/components/BreakfastControlCard";
import { controlEntries, controlLongDateLabel, formatBreakfastControl, freeRooms, generatedLabel, summarizeBreakfastControl, type ControlReservation, type ControlUnit } from "@/features/operations/logic/breakfast-control";

const D = "2026-09-30";
const GENERATED = new Date("2026-09-29T18:40:00Z"); // 12:40 in Costa Rica (UTC-6)

const units: ControlUnit[] = [
  ...["1", "2", "3", "8", "11", "12", "14"].map((n, i): ControlUnit => ({ roomId: `r${n}`, roomNumber: n, unitType: "room", parentRoomNumber: null, sortOrder: i + 1, active: true })),
  ...[1, 2, 3, 4, 5, 6].map((n): ControlUnit => ({ roomId: `b${n}`, roomNumber: `B${n}`, unitType: "bunk", parentRoomNumber: "20", sortOrder: 19 + n, active: true }))
];
const reservation = (id: string, roomId: string, over: Partial<ControlReservation> = {}): ControlReservation => ({ id, roomId, guestName: `Guest ${id}`, arrivalDate: "2026-09-28", departureDate: "2026-10-02", adults: 2, children: 0, babies: 0, notes: null, ...over });

const reservations = [
  reservation("a", "r1", { adults: 3, guestName: "Vargas, Sofía" }),
  reservation("b", "r3"),
  reservation("c", "r11", { adults: 2, babies: 1, notes: "Desayuno incluido" }),
  reservation("d", "r14", { departureDate: D, notes: "Breakfast included" }),
  reservation("e", "b1", { adults: 1, guestName: "Tom" }),
  reservation("f", "b2", { adults: 1, guestName: "Eva" }),
  reservation("g", "r2", { departureDate: "2026-09-29" }), // leaves today: not listed
  reservation("h", "r8", { arrivalDate: D }) // arrives on D: not listed
];
const dayRows = [{ roomId: "b1", reservationId: "e", breakfastStatus: "included" as const, breakfastPax: 1, breakfastToGo: true, breakfastToGoTime: "06:30", breakfastNotes: "Sin gluten" }];

afterEach(cleanup);

const setup = () => {
  const entries = controlEntries({ date: D, units, reservations, dayRows, previousDayRows: [] });
  const summary = summarizeBreakfastControl({ entries, free: freeRooms(units, entries) });
  const text = formatBreakfastControl({ date: D, summary });
  render(<BreakfastControlCard date={D} generatedAt={GENERATED} summary={summary} />);
  return { summary, text, textLines: text.split("\n") };
};

describe("Control de desayunos card vs text", () => {
  it("lists the same rooms and the same two totals", () => {
    const { textLines } = setup();

    // Rooms: the first field of each guest line in the text vs the card rows, in order.
    const textRooms = textLines.slice(2, textLines.findIndex((line) => line.startsWith("Libres:"))).map((line) => line.split(" · ")[0]);
    const cardRooms = screen.getAllByRole("row").filter((row) => row.hasAttribute("data-room")).map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(textRooms).toEqual(["1", "3", "11", "14", "20 camas"]);
    expect(cardRooms).toEqual(textRooms);

    // Free rooms.
    expect(textLines).toContain("Libres: 2, 8, 12");
    expect(screen.getByTestId("control-free").textContent).toBe("Libres: 2, 8, 12");

    // Totals: guests in the hotel, and included covers + rooms.
    expect(textLines).toContain("Total huéspedes en el hotel: 12 pax");
    expect(textLines).toContain("Con desayuno incluido: 5 pax (3 hab.)");
    expect(screen.getByTestId("control-guests").textContent).toBe("12");
    expect(screen.getByTestId("control-included").textContent).toBe("5");
    expect(screen.getByTestId("control-included-rooms").textContent).toBe("pax · 3 hab.");
  });

  it("is always in Spanish: columns, totals, header and footer", () => {
    setup();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Hab.", "Huésped", "Pax", "Desayuno", "Observaciones", "\u2713"]);
    expect(screen.getByText("Total huéspedes en el hotel")).toBeInTheDocument();
    expect(screen.getByText("Desayunos incluidos")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Control de desayunos" })).toBeInTheDocument();
    expect(screen.getByText("miércoles 30/09/2026", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Generado mar 29/09/2026 · 12:40")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo").textContent).toBe("Hotel Yuli · YuliOS");
  });

  it("row details: name flipped, included pill, to-go time, \u26A0\uFE0F note, empty checkbox", () => {
    setup();
    const row = (label: string) => screen.getAllByRole("row").find((r) => r.getAttribute("data-room") === label)!;
    expect(within(row("1")).getAllByRole("cell")[1].textContent).toBe("Sofía Vargas");
    expect(within(row("11")).getAllByRole("cell")[3].textContent).toBe("\u2615 INCLUIDO (2)");
    expect(within(row("20 camas")).getAllByRole("cell")[3].textContent).toBe("\u2615 INCLUIDO (1)\u{1F961} 06:30");
    expect(within(row("20 camas")).getAllByRole("cell")[4].textContent).toBe("\u26A0\uFE0F Sin gluten");
    expect(within(row("3")).getAllByRole("cell")[4].textContent).toBe(""); // blank space to write in
    expect(row("3").querySelector(".bk-box")).not.toBeNull();
  });

  it("empty day: no rooms and zero totals on both", () => {
    const summary = summarizeBreakfastControl({ entries: [], free: [] });
    const text = formatBreakfastControl({ date: D, summary });
    render(<BreakfastControlCard date={D} generatedAt={GENERATED} summary={summary} />);
    expect(screen.queryAllByRole("row").filter((row) => row.hasAttribute("data-room"))).toHaveLength(0);
    expect(text).toContain("Sin huéspedes para el desayuno.");
    expect(screen.getByText("Sin huéspedes para el desayuno.")).toBeInTheDocument();
    expect(screen.getByTestId("control-free").textContent).toBe("Libres: ninguna");
    expect(screen.getByTestId("control-guests").textContent).toBe("0");
    expect(screen.getByTestId("control-included-rooms").textContent).toBe("pax · 0 hab.");
  });
});

describe("sheet date labels", () => {
  it("long weekday header", () => expect(controlLongDateLabel("2026-10-03")).toBe("sábado 03/10/2026"));
  it("generated time is Costa Rica time", () => expect(generatedLabel(new Date("2026-10-02T18:40:00Z"))).toBe("vie 02/10/2026 · 12:40"));
});
