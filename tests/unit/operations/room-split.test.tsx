import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { allocatePax, evenSplit, reservationSplits, splitDifference, splitPaxFields, type SplitSource } from "@/features/operations/logic/pax";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const saveReservationSplit = vi.fn();
vi.mock("@/features/operations/actions", () => ({ loadReservationSplit: vi.fn(), saveReservationSplit: (...args: unknown[]) => saveReservationSplit(...args) }));
const { SplitPaxDialog } = await import("@/features/operations/components/SplitPaxDialog");

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const rows = (count: number, pax: [number, number, number], split?: [number, number, number][]): SplitSource[] => Array.from({ length: count }, (_, i) => ({
  id: `r${i}`, reference: "NRVA #25", arrivalDate: "2026-10-26", adults: pax[0], children: pax[1], babies: pax[2],
  splitAdults: split?.[i]?.[0] ?? null, splitChildren: split?.[i]?.[1] ?? null, splitBabies: split?.[i]?.[2] ?? null, splitBreakfast: split ? true : null
}));

describe("even split", () => {
  it("20 pax over 12 rooms: 2 in the first 8, 1 in the last 4; every room gets an adult first", () => {
    const split = evenSplit({ adults: 18, children: 2, babies: 0 }, 12);
    expect(split.map((room) => room.adults + room.children)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1]);
    expect(split.every((room) => room.adults >= 1)).toBe(true);
    expect(splitDifference({ adults: 18, children: 2, babies: 0 }, split)).toEqual({ adults: 0, children: 0, babies: 0 });
  });
});

describe("split state", () => {
  it("none / split / resplit (LH changed the pax), breakfast kept when stale", () => {
    expect(reservationSplits(rows(2, [3, 0, 0])).get("r0")).toMatchObject({ state: "none", room: { adults: 3 }, rooms: 2 });
    expect(reservationSplits(rows(2, [3, 0, 0], [[2, 0, 0], [1, 0, 0]])).get("r1")).toMatchObject({ state: "split", room: { adults: 1 }, breakfast: true });
    expect(reservationSplits(rows(2, [4, 0, 0], [[2, 0, 0], [1, 0, 0]])).get("r1")).toMatchObject({ state: "resplit", room: { adults: 4 }, breakfast: true });
  });

  it("a booking not split never counts below its pax, even when only one room has breakfast; a single-room booking keeps its own number", () => {
    const pending = reservationSplits(rows(12, [18, 2, 0])).get("r0")!;
    expect(allocatePax([{ dorm: false, pax: 2, reference: "NRVA #25", arrivalDate: "2026-10-26", ...splitPaxFields(pending, true) }])[0].pax).toBe(20);
    const single = reservationSplits([{ ...rows(1, [2, 0, 0])[0], reference: "LH-1" }]).get("r0")!;
    expect(splitPaxFields(single, true)).toEqual({});
  });
});

describe("Repartir pax dialog", () => {
  const data = { reference: "NRVA #25", arrivalDate: "2026-10-26", guest: "Grupo, NRVA", state: "none" as const, booking: { adults: 3, children: 1, babies: 0 }, breakfast: true,
    rooms: [{ roomId: "11111111-1111-4111-8111-111111111111", label: "Room 2", current: null }, { roomId: "22222222-2222-4222-8222-222222222222", label: "Room 3", current: null }] };

  it("starts with the even split, blocks saving until the totals match, then sends every room", async () => {
    saveReservationSplit.mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    render(<SplitPaxDialog data={data} locale="es" onClose={onClose} />);
    expect(screen.getByTestId("split-total").textContent).toBe("4 / 4");
    fireEvent.change(screen.getByLabelText("Room 3 Adultos"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Guardar reparto" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Repartir parejo" }));
    expect(screen.getByRole("button", { name: "Guardar reparto" })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar reparto" })); });
    expect(saveReservationSplit).toHaveBeenCalledWith({ reference: "NRVA #25", arrivalDate: "2026-10-26", breakfast: true, rooms: [
      { roomId: data.rooms[0].roomId, adults: 2, children: 0, babies: 0 },
      { roomId: data.rooms[1].roomId, adults: 1, children: 1, babies: 0 }
    ] });
    expect(refresh).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
