import { describe, expect, it } from "vitest";
import { planMaterialization } from "@/features/operations/logic/materialize-plan";
import type { MaterializedCell } from "@/features/operations/logic/board";

function cell(roomId: string): MaterializedCell {
  return {
    roomId,
    operationalStatus: "check_in",
    housekeepingCategory: null,
    sameDayArrival: false,
    reservationId: "res-1",
    guestName: "Guest",
    adults: 1,
    children: 0,
    babies: 0,
    arrivalDate: "2026-03-10",
    departureDate: "2026-03-12",
    outstandingBalance: null,
    currency: null,
    paymentStatus: null
  };
}

describe("planMaterialization", () => {
  it("writes every cell when nothing was manually modified", () => {
    const plan = planMaterialization([cell("room-1"), cell("room-2")], []);
    expect(plan.toWrite.map((c) => c.roomId)).toEqual(["room-1", "room-2"]);
    expect(plan.preservedRoomIds).toEqual([]);
  });

  it("never overwrites a room a receptionist hand-edited", () => {
    const plan = planMaterialization(
      [cell("room-1"), cell("room-2")],
      [{ roomId: "room-1", manuallyModified: true }, { roomId: "room-2", manuallyModified: false }]
    );
    expect(plan.toWrite.map((c) => c.roomId)).toEqual(["room-2"]);
    expect(plan.preservedRoomIds).toEqual(["room-1"]);
  });
});
