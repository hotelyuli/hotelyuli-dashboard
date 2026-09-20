import { describe, expect, it } from "vitest";
import { materializeBoard, materializeUnit, type ReservationForBoard } from "@/features/operations/logic/board";

const DATE = "2026-03-10";

function reservation(overrides: Partial<ReservationForBoard>): ReservationForBoard {
  return {
    id: "res-1",
    roomId: "room-1",
    guestName: "Guest",
    arrivalDate: DATE,
    departureDate: DATE,
    adults: 1,
    children: 0,
    babies: 0,
    outstandingBalance: null,
    currency: null,
    ...overrides
  };
}

describe("materializeUnit", () => {
  it("marks a unit as check_in when the reservation arrives today", () => {
    const cell = materializeUnit([reservation({ arrivalDate: DATE, departureDate: "2026-03-12" })], DATE);
    expect(cell.operationalStatus).toBe("check_in");
    expect(cell.housekeepingCategory).toBeNull();
    expect(cell.sameDayArrival).toBe(false);
  });

  it("marks a unit as staying when arrival is before and departure is after today", () => {
    const cell = materializeUnit([reservation({ arrivalDate: "2026-03-08", departureDate: "2026-03-12" })], DATE);
    expect(cell.operationalStatus).toBe("staying");
    expect(cell.housekeepingCategory).toBe("remains_occupied");
  });

  it("marks a unit check-out-only as available with vacant_after_departure", () => {
    const cell = materializeUnit([reservation({ arrivalDate: "2026-03-05", departureDate: DATE })], DATE);
    expect(cell.operationalStatus).toBe("available");
    expect(cell.housekeepingCategory).toBe("vacant_after_departure");
    expect(cell.guestName).toBeNull();
  });

  it("excludes a reservation whose stay is entirely in the future", () => {
    const cell = materializeUnit([reservation({ arrivalDate: "2026-03-11", departureDate: "2026-03-14" })], DATE);
    expect(cell.operationalStatus).toBe("available");
    expect(cell.reservationId).toBeNull();
  });

  it("excludes a reservation whose stay is entirely in the past", () => {
    const cell = materializeUnit([reservation({ arrivalDate: "2026-03-01", departureDate: "2026-03-05" })], DATE);
    expect(cell.operationalStatus).toBe("available");
    expect(cell.reservationId).toBeNull();
  });

  it("prioritizes the arriving guest on a same-day departure+arrival and never shows the departer", () => {
    const departing = reservation({ id: "departing", arrivalDate: "2026-03-05", departureDate: DATE, guestName: "Departing Guest" });
    const arriving = reservation({ id: "arriving", arrivalDate: DATE, departureDate: "2026-03-13", guestName: "Arriving Guest" });
    const cell = materializeUnit([departing, arriving], DATE);
    expect(cell.operationalStatus).toBe("check_in");
    expect(cell.guestName).toBe("Arriving Guest");
    expect(cell.reservationId).toBe("arriving");
    expect(cell.sameDayArrival).toBe(true);
    expect(cell.housekeepingCategory).toBe("priority");
  });

  it("marks an out-of-service unit regardless of reservations", () => {
    const cell = materializeUnit([reservation({ arrivalDate: DATE, departureDate: "2026-03-12" })], DATE, true);
    expect(cell.operationalStatus).toBe("out_of_service");
  });

  it("marks an empty unit as available with no housekeeping category", () => {
    const cell = materializeUnit([], DATE);
    expect(cell.operationalStatus).toBe("available");
    expect(cell.housekeepingCategory).toBeNull();
  });

  // Rule 7: outstanding balance > 0 -> pending, == 0 -> paid.
  it("derives payment status from the occupant's outstanding balance", () => {
    const pending = materializeUnit([reservation({ arrivalDate: DATE, departureDate: "2026-03-12", outstandingBalance: 45.5, currency: "USD" })], DATE);
    expect(pending.paymentStatus).toBe("pending");
    expect(pending.outstandingBalance).toBe(45.5);
    expect(pending.currency).toBe("USD");

    const paid = materializeUnit([reservation({ arrivalDate: DATE, departureDate: "2026-03-12", outstandingBalance: 0, currency: "USD" })], DATE);
    expect(paid.paymentStatus).toBe("paid");

    const noData = materializeUnit([reservation({ arrivalDate: DATE, departureDate: "2026-03-12", outstandingBalance: null, currency: null })], DATE);
    expect(noData.paymentStatus).toBeNull();

    const empty = materializeUnit([], DATE);
    expect(empty.paymentStatus).toBeNull();
  });
});

describe("materializeBoard", () => {
  it("maps every unit independently, including empty ones", () => {
    const units = [{ roomId: "room-1" }, { roomId: "room-2" }, { roomId: "room-3", outOfService: true }];
    const reservations = [reservation({ roomId: "room-1", arrivalDate: DATE, departureDate: "2026-03-12" })];
    const cells = materializeBoard(units, reservations, DATE);
    expect(cells).toHaveLength(3);
    expect(cells.find((c) => c.roomId === "room-1")?.operationalStatus).toBe("check_in");
    expect(cells.find((c) => c.roomId === "room-2")?.operationalStatus).toBe("available");
    expect(cells.find((c) => c.roomId === "room-3")?.operationalStatus).toBe("out_of_service");
  });

  // Real fixture: Room 17 and Room 18 both appear in today's check-out AND
  // today's check-in files (same-day turnover on two independent rooms).
  it("handles same-day turnover on multiple rooms independently, never mixing up occupants", () => {
    const units = [{ roomId: "room-17" }, { roomId: "room-18" }];
    const reservations = [
      reservation({ id: "r17-out", roomId: "room-17", arrivalDate: "2026-03-06", departureDate: DATE, guestName: "Guest Departing 17" }),
      reservation({ id: "r17-in", roomId: "room-17", arrivalDate: DATE, departureDate: "2026-03-14", guestName: "Guest Arriving 17" }),
      reservation({ id: "r18-out", roomId: "room-18", arrivalDate: "2026-03-04", departureDate: DATE, guestName: "Guest Departing 18" }),
      reservation({ id: "r18-in", roomId: "room-18", arrivalDate: DATE, departureDate: "2026-03-15", guestName: "Guest Arriving 18" })
    ];
    const cells = materializeBoard(units, reservations, DATE);

    const room17 = cells.find((c) => c.roomId === "room-17");
    expect(room17?.operationalStatus).toBe("check_in");
    expect(room17?.housekeepingCategory).toBe("priority");
    expect(room17?.sameDayArrival).toBe(true);
    expect(room17?.reservationId).toBe("r17-in");
    expect(room17?.guestName).toBe("Guest Arriving 17");

    const room18 = cells.find((c) => c.roomId === "room-18");
    expect(room18?.operationalStatus).toBe("check_in");
    expect(room18?.housekeepingCategory).toBe("priority");
    expect(room18?.sameDayArrival).toBe(true);
    expect(room18?.reservationId).toBe("r18-in");
    expect(room18?.guestName).toBe("Guest Arriving 18");
  });

  // Real fixture: Bed 1 arrives today while Beds 1-6 (the Room 20 dorm) all
  // depart today. Bed 1 is a same-day turnover; Beds 2-6 are plain checkouts.
  it("keeps one bunk's priority turnover independent from its siblings' plain checkouts", () => {
    const units = [
      { roomId: "bed-1" }, { roomId: "bed-2" }, { roomId: "bed-3" },
      { roomId: "bed-4" }, { roomId: "bed-5" }, { roomId: "bed-6" }
    ];
    const reservations = [
      reservation({ id: "bed1-out", roomId: "bed-1", arrivalDate: "2026-03-07", departureDate: DATE, guestName: "Dorm Departing 1" }),
      reservation({ id: "bed1-in", roomId: "bed-1", arrivalDate: DATE, departureDate: "2026-03-12", guestName: "Dorm Arriving 1" }),
      ...["bed-2", "bed-3", "bed-4", "bed-5", "bed-6"].map((roomId, index) =>
        reservation({ id: `${roomId}-out`, roomId, arrivalDate: "2026-03-06", departureDate: DATE, guestName: `Dorm Departing ${index + 2}` })
      )
    ];
    const cells = materializeBoard(units, reservations, DATE);

    const bed1 = cells.find((c) => c.roomId === "bed-1");
    expect(bed1?.operationalStatus).toBe("check_in");
    expect(bed1?.housekeepingCategory).toBe("priority");
    expect(bed1?.sameDayArrival).toBe(true);

    for (const roomId of ["bed-2", "bed-3", "bed-4", "bed-5", "bed-6"]) {
      const bed = cells.find((c) => c.roomId === roomId);
      expect(bed?.operationalStatus).toBe("available");
      expect(bed?.housekeepingCategory).toBe("vacant_after_departure");
      expect(bed?.sameDayArrival).toBe(false);
      expect(bed?.guestName).toBeNull();
    }
  });

  // Real fixture: a stay-through booked from a prior day's check-in import
  // (arrival well before today, departure well after) is still "staying" today,
  // regardless of when the underlying reservation was materialized.
  it("keeps a stay-through booked from a much earlier import as staying today", () => {
    const units = [{ roomId: "room-9" }];
    const reservations = [reservation({ roomId: "room-9", arrivalDate: "2026-02-28", departureDate: "2026-03-20", guestName: "Long Stay Guest" })];
    const cells = materializeBoard(units, reservations, DATE);
    const room9 = cells.find((c) => c.roomId === "room-9");
    expect(room9?.operationalStatus).toBe("staying");
    expect(room9?.housekeepingCategory).toBe("remains_occupied");
  });
});
