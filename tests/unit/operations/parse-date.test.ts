import { describe, expect, it } from "vitest";
import { addDaysToIsoDate, parseCsvDate } from "@/features/operations/logic/parse-date";

describe("parseCsvDate", () => {
  it("accepts DD-MM-YYYY as the locked primary format", () => {
    expect(parseCsvDate("19-09-2026")).toEqual({ ok: true, isoDate: "2026-09-19" });
  });

  it("accepts ISO dates as a tolerant fallback", () => {
    expect(parseCsvDate("2026-03-10")).toEqual({ ok: true, isoDate: "2026-03-10" });
  });

  it("rejects an impossible calendar date", () => {
    expect(parseCsvDate("31-02-2026")).toEqual({ ok: false, error: "INVALID_DATE" });
  });

  it("rejects the previously-assumed slash format and any other format, rather than guessing", () => {
    expect(parseCsvDate("10/03/2026")).toEqual({ ok: false, error: "INVALID_DATE" });
    expect(parseCsvDate("March 10, 2026")).toEqual({ ok: false, error: "INVALID_DATE" });
    expect(parseCsvDate("2026/03/10")).toEqual({ ok: false, error: "INVALID_DATE" });
  });
});

describe("addDaysToIsoDate", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysToIsoDate("2026-09-19", 3)).toBe("2026-09-22");
    expect(addDaysToIsoDate("2026-09-29", 3)).toBe("2026-10-02");
  });

  it("subtracts days across a month boundary", () => {
    expect(addDaysToIsoDate("2026-10-02", -3)).toBe("2026-09-29");
  });
});
