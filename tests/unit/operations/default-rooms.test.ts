import { describe, expect, it } from "vitest";
import { buildDefaultRooms } from "@/features/operations/logic/default-rooms";

describe("buildDefaultRooms", () => {
  it("creates rooms 1-19 and six independent Room 20 bunks", () => {
    const rooms = buildDefaultRooms("hotel-yuli");

    expect(rooms).toHaveLength(25);
    expect(rooms[0]).toMatchObject({ unit_code: "1", display_name: "Room 1", room_number: "1" });
    expect(rooms[18]).toMatchObject({ unit_code: "19", display_name: "Room 19", room_number: "19" });
    expect(rooms[19]).toMatchObject({ unit_code: "B1", display_name: "Bed 1", room_number: "20", parent_room_number: "20" });
    expect(rooms[24]).toMatchObject({ unit_code: "B6", display_name: "Bed 6", room_number: "20", parent_room_number: "20" });
    expect(rooms.some((room) => room.unit_code === "20")).toBe(false);
  });
});
