import { describe, expect, it } from "vitest";
import { selectedTourDay } from "@/features/records/logic/tour-day";

describe("Booked tours day filter", () => {
  const today = "2026-09-25";
  it("defaults to today", () => {
    expect(selectedTourDay(undefined, today)).toBe(today);
    expect(selectedTourDay("", today)).toBe(today);
  });
  it("uses a valid ?date=", () => {
    expect(selectedTourDay("2026-09-27", today)).toBe("2026-09-27");
    expect(selectedTourDay(["2026-08-01", "2026-08-02"], today)).toBe("2026-08-01");
  });
  it("ignores malformed or impossible dates", () => {
    expect(selectedTourDay("2026-02-30", today)).toBe(today);
    expect(selectedTourDay("27/09/2026", today)).toBe(today);
    expect(selectedTourDay("2026-09-27'; drop", today)).toBe(today);
  });
});
