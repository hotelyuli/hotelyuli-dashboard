import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { RoomBoardSheet } from "@/features/operations/components/RoomBoardSheet";
import { RoomBoardPrintActions, RoomBoardPrintProvider, RoomBoardPrintSheet } from "@/features/operations/components/RoomBoardPrint";
import { summarizeBoardSheet, type BoardSheetRow } from "@/features/operations/logic/board-sheet";
import { boardPdfName, boardPngName } from "@/features/reports/logic/share-file";

const D = "2026-10-23";
const GENERATED = new Date("2026-10-23T14:05:00Z"); // 08:05 in Costa Rica (UTC-6)

const unit = (n: number): BoardSheetRow => {
  const dorm = n > 19;
  return {
    rowId: `op${n}`, roomId: `r${n}`, roomLabel: dorm ? `Bed ${n - 19}` : `Room ${n}`, roomNumber: dorm ? "20" : String(n), dorm, unitCode: dorm ? `B${n - 19}` : String(n),
    reservationId: null, arrivalDate: null, guestName: null, adults: 0, children: 0, babies: 0, totalPax: 0, departureDate: null,
    operationalStatus: "available", breakfastStatus: "not_included", breakfastPax: 0, breakfastToGo: false, breakfastNotes: null, breakfastToGoTime: null,
    paymentStatus: null, paymentMethod: null, outstandingBalance: null, currency: null, carPlate: null, bookingChannel: null, notes: null,
    housekeepingCategory: null, sameDayArrival: false, housekeeper: null, bedSetup: null, tours: []
  };
};
const occupied = (n: number, over: Partial<BoardSheetRow>): BoardSheetRow => ({ ...unit(n), operationalStatus: "staying", arrivalDate: "2026-10-21", departureDate: "2026-10-25", ...over });

// 25 units: rooms 1-19 and beds B1-B6 of Room 20.
const rows: BoardSheetRow[] = Array.from({ length: 25 }, (_, i) => unit(i + 1));
rows[0] = occupied(1, { reservationId: "a", guestName: "Vargas, Sofía", adults: 2, totalPax: 2, breakfastStatus: "included", breakfastPax: 2, carPlate: "BCD123", bookingChannel: "Booking.com", paymentStatus: "pending", paymentMethod: "Tarjeta", outstandingBalance: 120, currency: "USD", notes: "Late check-out", tours: [{ id: "t1", tourName: "Catarata", tourDate: D, status: "paid" }] });
rows[2] = occupied(3, { reservationId: "b", guestName: "Ana Mora", adults: 1, children: 1, totalPax: 2, operationalStatus: "check_in", arrivalDate: D });
rows[4] = { ...unit(5), operationalStatus: "out_of_service" };
rows[6] = { ...unit(7), housekeepingCategory: "vacant_after_departure" };
// One dorm booking of 4 pax on beds B1-B4 (one reservation row per bed, each with the full pax)…
for (const bed of [20, 21, 22, 23]) rows[bed - 1] = occupied(bed, { reservationId: `dorm-${bed}`, guestName: "Group, Surf", adults: 4, totalPax: 4, breakfastStatus: "included", breakfastPax: 4, outstandingBalance: 80, currency: "USD", paymentStatus: "pending" });
// …and another guest on B5.
rows[23] = occupied(24, { reservationId: "e", guestName: "Tom", adults: 1, totalPax: 1, breakfastStatus: "included", breakfastPax: 1, breakfastToGo: true, breakfastToGoTime: "06:30" });

afterEach(cleanup);

const lineRows = () => screen.getAllByRole("row").filter((row) => row.hasAttribute("data-room"));
const row = (label: string) => lineRows().find((r) => r.getAttribute("data-room") === label)!;
const cells = (label: string) => within(row(label)).getAllByRole("cell").map((cell) => cell.textContent);

describe("Tablero de operaciones sheet", () => {
  it("covers all 25 units: rooms 1-19 plus one merged '20 camas' line, in board order", () => {
    const summary = summarizeBoardSheet(rows);
    render(<RoomBoardSheet date={D} generatedAt={GENERATED} summary={summary} includePayments={false} />);
    expect(summary.units).toBe(25);
    expect(lineRows().map((r) => r.getAttribute("data-room"))).toEqual([...Array.from({ length: 19 }, (_, i) => String(i + 1)), "20 camas"]);
    expect(within(row("20 camas")).getAllByRole("cell")[0].textContent).toBe("20 camas");
  });

  it("pax: each line matches the board data and the total is the sum of the lines, the dorm booking counted once", () => {
    const summary = summarizeBoardSheet(rows);
    render(<RoomBoardSheet date={D} generatedAt={GENERATED} summary={summary} includePayments={false} />);
    const paxCells = lineRows().map((r) => within(r).getAllByRole("cell")[2].textContent);
    expect(cells("1")[2]).toBe("2");
    expect(cells("3")[2]).toBe("2");
    expect(cells("20 camas")[2]).toBe("5"); // 4 (B1-B4 booking, once) + 1 (Tom)
    expect(cells("2")[2]).toBe("—");
    const sum = paxCells.reduce((total, value) => total + (Number(value) || 0), 0);
    expect(sum).toBe(9);
    expect(summary.pax).toBe(sum);
    expect(screen.getByTestId("board-pax").textContent).toBe("9");
    expect(screen.getByTestId("board-breakfast").textContent).toBe("7"); // 2 + 4 + 1
    expect(screen.getByTestId("board-occupied").textContent).toBe("3"); // 1, 3, 20 camas
    expect(screen.getByTestId("board-lines").textContent).toBe("de 20 · 16 libres"); // 5 is out of service
  });

  it("free rooms read 'Libre'; status, breakfast, plate, channel, departure, tours and notes come from the board", () => {
    render(<RoomBoardSheet date={D} generatedAt={GENERATED} summary={summarizeBoardSheet(rows)} includePayments={false} />);
    expect(cells("2")).toEqual(["2", "—", "—", "Libre", "—", "—", "—", "—", "—", "—"]);
    expect(cells("7")[3]).toBe("LibreVacante tras salida");
    expect(cells("5")[3]).toBe("Fuera de servicio");
    expect(cells("3")[3]).toBe("Llegada");
    expect(cells("1")).toEqual(["1", "Sofía Vargas", "2", "Permanece", "☕ INCLUIDO (2)", "BCD123", "Booking.com", "25/10", "CatarataHoy · Pagado", "Late check-out"]);
    expect(cells("20 camas")).toEqual(["20 camas", "Surf Group / Tom", "5", "Permanece", "☕ INCLUIDO (5)\u{1F961} 06:30", "—", "—", "25/10", "—", "—"]);
  });

  it("is always in Spanish, without Actions, and hides Pago/Saldo unless asked", () => {
    const { rerender } = render(<RoomBoardSheet date={D} generatedAt={GENERATED} summary={summarizeBoardSheet(rows)} includePayments={false} />);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Hab.", "Huésped", "Pax", "Estado", "Desayuno", "Placa", "Canal", "Salida", "Tours", "Notas"]);
    expect(screen.queryByText(/USD/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Tablero de operaciones" })).toBeInTheDocument();
    expect(screen.getByText("viernes 23/10/2026", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Generado vie 23/10/2026 · 08:05")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo").textContent).toBe("Hotel Yuli · YuliOS");

    rerender(<RoomBoardSheet date={D} generatedAt={GENERATED} summary={summarizeBoardSheet(rows)} includePayments />);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Hab.", "Huésped", "Pax", "Estado", "Pago", "Saldo", "Desayuno", "Placa", "Canal", "Salida", "Tours", "Notas"]);
    expect(cells("1").slice(4, 6)).toEqual(["Pendiente · Tarjeta", "USD 120.00"]);
    expect(cells("20 camas").slice(4, 6)).toEqual(["Pendiente", "USD 80.00"]); // the dorm booking's balance once
  });
});

describe("Room board print actions", () => {
  const original = window.matchMedia;
  const pointer = (coarse: boolean) => { window.matchMedia = ((query: string) => ({ matches: coarse, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia; };
  const canShareFiles = (supported: boolean | undefined) => { Object.defineProperty(navigator, "canShare", { configurable: true, value: supported === undefined ? undefined : (data: ShareData) => supported && data.files?.[0]?.type === "application/pdf" }); };
  afterEach(() => { window.matchMedia = original; canShareFiles(undefined); });
  const page = () => render(<RoomBoardPrintProvider><RoomBoardPrintActions date={D} locale="es" /><RoomBoardPrintSheet date={D} generatedAt={GENERATED} summary={summarizeBoardSheet(rows)} /></RoomBoardPrintProvider>);
  const labels = () => screen.getAllByRole("button").map((button) => button.textContent);

  it("names the files tablero-YYYY-MM-DD.pdf / .png", () => {
    expect(boardPdfName(D)).toBe("tablero-2026-10-23.pdf");
    expect(boardPngName(D)).toBe("tablero-2026-10-23.png");
  });

  it("phones that can share files: Descargar PDF · Imprimir · Descargar PNG · Compartir", () => {
    pointer(true);
    canShareFiles(true);
    page();
    expect(labels()).toEqual(["Descargar PDF", "Imprimir", "Descargar PNG", "Compartir"]);
    expect(screen.getByText("Descargar PDF")).toHaveClass("primary-button");
  });

  it("desktop: no Compartir and no save button", () => {
    pointer(false);
    canShareFiles(true);
    page();
    expect(labels()).toEqual(["Descargar PDF", "Imprimir", "Descargar PNG"]);
    expect(screen.queryByText(/Guardar/)).toBeNull();
  });

  it("'Incluir pagos' starts off and adds Pago/Saldo to the sheet when ticked", () => {
    pointer(false);
    page();
    const box = screen.getByRole("checkbox", { name: "Incluir pagos" });
    expect(box).not.toBeChecked();
    expect(screen.queryByRole("columnheader", { name: "Saldo" })).toBeNull();
    fireEvent.click(box);
    expect(screen.getByRole("columnheader", { name: "Pago" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Saldo" })).toBeInTheDocument();
  });
});

describe("Room board printing never writes to the database", () => {
  const root = path.resolve(__dirname, "../../..");
  it.each([
    "features/operations/components/RoomBoardSheet.tsx",
    "features/operations/components/RoomBoardPrint.tsx",
    "features/operations/logic/board-sheet.ts",
    "features/reports/logic/sheet-capture.ts"
  ])("%s has no writes, RPCs, server actions or save buttons", (file) => {
    const source = readFileSync(path.join(root, file), "utf8");
    expect(source).not.toMatch(/\.(insert|update|upsert)\(|\.from\([^)]*\)\s*\.delete\(|\.rpc\(|["']use server["']|\/actions["']|Guardar|localStorage/);
  });
  it("the Operaciones page only reads and no longer links the restaurant list; Desayuno still does", () => {
    const source = readFileSync(path.join(root, "app/(app)/operations/page.tsx"), "utf8");
    expect(source.match(/\.from\("[a-z_]+"\)/g)).toEqual(['.from("profiles")', '.from("rooms")', '.from("daily_operations")', '.from("tour_bookings")']);
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(source).not.toContain("/breakfast/control");
    expect(readFileSync(path.join(root, "app/(app)/breakfast/page.tsx"), "utf8")).toContain('href="/breakfast/control"');
  });
});
