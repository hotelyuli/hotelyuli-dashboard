import { describe, expect, it } from "vitest";
import { bedSetupLabel, supportsBedSetup } from "@/features/operations/logic/room-setup";

describe("supportsBedSetup", () => {
  it.each(["1", "2", "6", "9", "10", "12", "13", "18"])("allows convertible room %s", (unitCode) => {
    expect(supportsBedSetup(unitCode)).toBe(true);
  });

  it.each(["3", "5", "11", "19", "B1", "", null, undefined])("rejects room %s", (unitCode) => {
    expect(supportsBedSetup(unitCode)).toBe(false);
  });
});

describe("bedSetupLabel", () => {
  it("labels each value in both locales", () => {
    expect(bedSetupLabel("king", "es")).toBe("King");
    expect(bedSetupLabel("two_twin", "en")).toBe("2 Twin");
    expect(bedSetupLabel("three_twin", "es")).toBe("3 Twin");
    expect(bedSetupLabel("king_twin", "en")).toBe("King+Twin");
    expect(bedSetupLabel("unknown_value", "es")).toBe("Sin definir");
    expect(bedSetupLabel(null, "es")).toBe("Sin definir");
    expect(bedSetupLabel(null, "en")).toBe("Not set");
  });
});
