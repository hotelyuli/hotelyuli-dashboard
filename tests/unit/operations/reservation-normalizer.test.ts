import { describe, expect, it } from "vitest";
import { inferBookingChannel, normalizeReservationRow } from "@/features/operations/logic/reservation-normalizer";
import { parseCsv } from "@/features/csv-import/logic/parser";

describe("normalizeReservationRow", () => {
  const checkInHeaders = [
    "Reservation Number", "Invoice Number", "Guest Name", "Check In", "LoS", "Room Number",
    "Adults / Children / Infants", "Extra Person", "Outstanding Balance", "Total Amount", "ETA", "Notes"
  ];

  it("normalizes a real-shaped check-in row: dash date + LoS -> computed departure", () => {
    const result = normalizeReservationRow(
      {
        "Reservation Number": "LH26091959154638",
        "Guest Name": "Test Guest",
        "Check In": "19-09-2026",
        LoS: "3",
        "Room Number": "Room 5",
        "Adults / Children / Infants": "2 / 1 / 0",
        "Outstanding Balance": "$0",
        "Total Amount": "$96.11",
        Notes: ""
      },
      checkInHeaders,
      "check_in"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.reference).toBe("LH26091959154638");
    expect(result.reservation.roomUnitCodes).toEqual(["5"]);
    expect(result.reservation.arrivalDate).toBe("2026-09-19");
    expect(result.reservation.departureDate).toBe("2026-09-22");
    expect(result.reservation.adults).toBe(2);
    expect(result.reservation.children).toBe(1);
    expect(result.reservation.babies).toBe(0);
    expect(result.reservation.currency).toBe("USD");
    expect(result.reservation.bookingChannel).toBe("Directo");
    expect(result.reservation.outstandingBalance).toBe(0);
    expect(result.reservation.totalAmount).toBe(96.11);
  });

  it("normalizes a real-shaped check-out row: dash date + LoS -> computed arrival", () => {
    const checkOutHeaders = ["Reservation Number", "Guest Name", "Check Out", "LoS", "Room Number", "Adults / Children / Infants", "Outstanding Balance", "Total Amount", "Notes"];
    const result = normalizeReservationRow(
      { "Reservation Number": "BDC-1", "Guest Name": "Test Guest", "Check Out": "20-09-2026", LoS: "2", "Room Number": "Room 9", "Adults / Children / Infants": "2 / 0 / 0", "Outstanding Balance": "$0", "Total Amount": "$100" },
      checkOutHeaders,
      "check_out"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.arrivalDate).toBe("2026-09-18");
    expect(result.reservation.departureDate).toBe("2026-09-20");
  });

  it("resolves a quoted multi-room cell end-to-end through the real CSV parser", () => {
    const csv = [
      "Reservation Number,Guest Name,Check In,LoS,Room Number,Adults / Children / Infants,Outstanding Balance,Total Amount",
      'LH1,Test Guest,19-09-2026,1,"Room 17,Room 16",3 / 0 / 0,$0,$96.11'
    ].join("\n");
    const parsed = parseCsv(csv);
    const result = normalizeReservationRow(parsed.rows[0], parsed.headers, "check_in");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.roomUnitCodes).toEqual(["17", "16"]);
  });

  it("rejects a row missing a required column (no LoS)", () => {
    const result = normalizeReservationRow({ "Room Number": "Room 5", "Check In": "19-09-2026" }, ["Room Number", "Check In"], "check_in");
    expect(result).toEqual({ ok: false, error: "MISSING_REQUIRED_FIELDS" });
  });

  it("rejects an unrecognized date format rather than guessing", () => {
    const result = normalizeReservationRow(
      { "Room Number": "5", "Check In": "09/19/2026", LoS: "2" },
      ["Room Number", "Check In", "LoS"],
      "check_in"
    );
    expect(result).toEqual({ ok: false, error: "INVALID_ARRIVAL_DATE" });
  });

  it("rejects a non-integer or zero LoS", () => {
    const result = normalizeReservationRow(
      { "Room Number": "5", "Check In": "19-09-2026", LoS: "0" },
      ["Room Number", "Check In", "LoS"],
      "check_in"
    );
    expect(result).toEqual({ ok: false, error: "INVALID_LOS" });
  });

  it("rejects an unresolvable room", () => {
    const result = normalizeReservationRow(
      { "Room Number": "Suite Presidencial", "Check In": "19-09-2026", LoS: "1" },
      ["Room Number", "Check In", "LoS"],
      "check_in"
    );
    expect(result).toEqual({ ok: false, error: "UNRESOLVED_ROOM" });
  });

  it("defaults pax to zero when the combined column is missing or malformed", () => {
    const result = normalizeReservationRow(
      { "Room Number": "5", "Check In": "19-09-2026", LoS: "1", "Adults / Children / Infants": "garbage" },
      ["Room Number", "Check In", "LoS", "Adults / Children / Infants"],
      "check_in"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.adults).toBe(0);
    expect(result.reservation.children).toBe(0);
    expect(result.reservation.babies).toBe(0);
  });
});

describe("inferBookingChannel", () => {
  it.each([
    ["LH26091959154638", "Directo"],
    ["BDC-5134582030", "Booking.com"],
    ["EXP-2531358436", "Expedia"],
    ["SMP-2026090151577902", "Simple Booking"],
    ["HWL-12345", "Hostelworld"],
    ["bdc-5134582030", "Booking.com"],
    ["  lh123", "Directo"]
  ])("maps %s to %s", (reference, channel) => {
    expect(inferBookingChannel(reference)).toBe(channel);
  });

  it.each([["XYZ-1"], ["LHX123"], ["12345"], [""], [null], [undefined]])("returns null for unknown or missing prefix %s", (reference) => {
    expect(inferBookingChannel(reference)).toBeNull();
  });
});
