import { describe, expect, it } from "vitest";
import { boardToursFilter, toursByUnit, type TourBookingForBoard } from "@/features/operations/logic/board-tours";

const today = "2026-09-25";
const tour = (overrides: Partial<TourBookingForBoard>): TourBookingForBoard => ({
  id: "t1", room_number: "5", guest_name: "Ana Pérez", tour_name: "Whale Watching", tour_date: today, operation_date: today, status: "pending", ...overrides
});

describe("Room board Tours column", () => {
  it("a tour booked from the board (room = unit code) shows on that room's row", () => {
    const map = toursByUnit([tour({ room_number: "B3", tour_date: "2026-09-27" })], today);
    expect(map.get("B3")).toEqual([{ id: "t1", tourName: "Whale Watching", tourDate: "2026-09-27", status: "pending" }]);
  });

  it("links typed room labels (Habitación 5) and keeps paid status; cancelled tours are hidden", () => {
    const map = toursByUnit([
      tour({ id: "a", room_number: "Habitación 5", status: "paid" }),
      tour({ id: "b", room_number: "5", status: "cancelled" }),
      tour({ id: "c", room_number: "5", tour_name: "Corcovado", tour_date: "2026-09-26" })
    ], today);
    expect(map.get("5")?.map((entry) => [entry.id, entry.status])).toEqual([["a", "paid"], ["c", "pending"]]);
  });

  it("shows tours booked today or taking place today or later, not old ones", () => {
    const map = toursByUnit([
      tour({ id: "old", operation_date: "2026-09-20", tour_date: "2026-09-22" }),
      tour({ id: "upcoming", operation_date: "2026-09-20", tour_date: "2026-09-26" }),
      tour({ id: "booked-today-for-past", operation_date: today, tour_date: "2026-09-24" })
    ], today);
    expect(map.get("5")?.map((entry) => entry.id)).toEqual(["booked-today-for-past", "upcoming"]);
    expect(boardToursFilter(today)).toBe("operation_date.eq.2026-09-25,tour_date.gte.2026-09-25");
  });

  it("a room naming several units (dorm) goes to the bed whose guest matches, else the first", () => {
    const guests = new Map([["B1", "Luis"], ["B4", "ana pérez"]]);
    expect([...toursByUnit([tour({ room_number: "dorm" })], today, guests).keys()]).toEqual(["B4"]);
    expect([...toursByUnit([tour({ room_number: "dorm", guest_name: "Nadie" })], today, guests).keys()]).toEqual(["B1"]);
  });

  it("ignores tours without a room or with an unknown room", () => {
    expect(toursByUnit([tour({ room_number: null }), tour({ room_number: "Pool" })], today).size).toBe(0);
  });
});
