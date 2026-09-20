import { describe, expect, it } from "vitest";
import { resolveRoomTokens } from "@/features/operations/logic/room-resolver";

describe("resolveRoomTokens", () => {
  it("resolves Spanish room tokens", () => {
    expect(resolveRoomTokens("Habitación 5").unitCodes).toEqual(["5"]);
    expect(resolveRoomTokens("Hab 5").unitCodes).toEqual(["5"]);
  });

  it("resolves English room tokens and bare numbers", () => {
    expect(resolveRoomTokens("Room 5").unitCodes).toEqual(["5"]);
    expect(resolveRoomTokens("5").unitCodes).toEqual(["5"]);
  });

  it("resolves bed tokens in Spanish and English", () => {
    expect(resolveRoomTokens("Cama 3").unitCodes).toEqual(["B3"]);
    expect(resolveRoomTokens("Bed 3").unitCodes).toEqual(["B3"]);
    expect(resolveRoomTokens("B3").unitCodes).toEqual(["B3"]);
  });

  it("maps Room 20 to all six bunks", () => {
    expect(resolveRoomTokens("Habitación 20").unitCodes).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
    expect(resolveRoomTokens("Room 20").unitCodes).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
    expect(resolveRoomTokens("Dorm").unitCodes).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
    expect(resolveRoomTokens("Bunk").unitCodes).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
  });

  it("dedupes repeated tokens", () => {
    expect(resolveRoomTokens("Room 5 / Habitación 5").unitCodes).toEqual(["5"]);
  });

  // Real fixture: a quoted multi-room CSV cell (e.g. "Room 17,Room 16") arrives
  // here as one comma-joined string once the CSV parser strips the quoting.
  it("resolves a quoted multi-room cell into two units", () => {
    expect(resolveRoomTokens("Room 17,Room 16").unitCodes).toEqual(["17", "16"]);
  });

  it("reports unmatched tokens as warnings without throwing", () => {
    const result = resolveRoomTokens("Suite Presidencial");
    expect(result.unitCodes).toEqual([]);
    expect(result.warnings).toEqual(["Suite Presidencial"]);
  });
});
