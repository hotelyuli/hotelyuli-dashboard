import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/features/csv-import/logic/parser";
import { normalizeReservationRow } from "@/features/operations/logic/reservation-normalizer";

/**
 * Validates the locked CSV contract against real Little Hotelier exports.
 * These files contain real guest names, are gitignored (see .gitignore),
 * and are NOT present in a fresh clone or CI — this suite skips itself
 * (not a failure) when they're absent. Assertions below are deliberately
 * limited to booleans/counts/dates so a failing assertion's diff can never
 * print a guest name.
 */
const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures");
const CHECK_IN_PATH = path.join(FIXTURES_DIR, "check_in_report.csv");
const CHECK_OUT_PATH = path.join(FIXTURES_DIR, "check_out_report.csv");
const hasFixtures = fs.existsSync(CHECK_IN_PATH) && fs.existsSync(CHECK_OUT_PATH);

describe.skipIf(!hasFixtures)("real Little Hotelier export fixtures", () => {
  it("normalizes every row of the real check-in report against the locked contract", () => {
    const parsed = parseCsv(fs.readFileSync(CHECK_IN_PATH, "utf-8"));
    expect(parsed.rows.length).toBeGreaterThan(0);
    const results = parsed.rows.map((row) => normalizeReservationRow(row, parsed.headers, "check_in"));

    expect(results.filter((r) => !r.ok).length).toBe(0);
    expect(results.every((r) => r.ok && r.reservation.roomUnitCodes.length > 0)).toBe(true);
    expect(results.every((r) => r.ok && /^\d{4}-\d{2}-\d{2}$/.test(r.reservation.arrivalDate))).toBe(true);
    expect(results.every((r) => r.ok && /^\d{4}-\d{2}-\d{2}$/.test(r.reservation.departureDate))).toBe(true);
    expect(results.every((r) => r.ok && r.reservation.departureDate > r.reservation.arrivalDate)).toBe(true);
    expect(results.every((r) => r.ok && r.reservation.currency === "USD")).toBe(true);
    expect(results.every((r) => r.ok && r.reservation.bookingChannel === null)).toBe(true);
  });

  it("normalizes every row of the real check-out report against the locked contract", () => {
    const parsed = parseCsv(fs.readFileSync(CHECK_OUT_PATH, "utf-8"));
    expect(parsed.rows.length).toBeGreaterThan(0);
    const results = parsed.rows.map((row) => normalizeReservationRow(row, parsed.headers, "check_out"));

    expect(results.filter((r) => !r.ok).length).toBe(0);
    expect(results.every((r) => r.ok && r.reservation.roomUnitCodes.length > 0)).toBe(true);
    expect(results.every((r) => r.ok && r.reservation.departureDate > r.reservation.arrivalDate)).toBe(true);
  });

  it("resolves the known real multi-room and multi-bed cells without warnings", () => {
    const parsed = parseCsv(fs.readFileSync(CHECK_IN_PATH, "utf-8"));
    const results = parsed.rows.map((row) => normalizeReservationRow(row, parsed.headers, "check_in"));
    const multiRoomResults = results.filter((r) => r.ok && r.reservation.roomUnitCodes.length > 1);
    expect(multiRoomResults.length).toBeGreaterThan(0);
    expect(multiRoomResults.every((r) => r.ok && r.warnings.length === 0)).toBe(true);
  });
});
