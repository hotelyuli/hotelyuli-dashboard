import { describe, expect, it } from "vitest";
import { parseCsv } from "@/features/csv-import/logic/parser";

describe("parseCsv", () => {
  it("parses reordered comma-separated headers", () => {
    const result = parseCsv('Guest,Room,Arrival\n"Doe, Jane",12,2026-09-20');
    expect(result.headers).toEqual(["Guest", "Room", "Arrival"]);
    expect(result.rows[0]).toEqual({ Guest: "Doe, Jane", Room: "12", Arrival: "2026-09-20" });
  });

  it("detects semicolon-delimited exports", () => {
    const result = parseCsv("Habitación;Huésped\n4;Ana");
    expect(result.rows[0]["Habitación"]).toBe("4");
  });

  it("supports quoted line breaks", () => {
    const result = parseCsv('Room,Notes\n4,"Late arrival\nNeeds parking"');
    expect(result.rows[0].Notes).toContain("Needs parking");
  });
});
