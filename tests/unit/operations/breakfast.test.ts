import { describe, it, expect } from "vitest";
import { normalizeReservationRow } from "@/features/operations/logic/reservation-normalizer";
import { parseCsv } from "@/features/csv-import/logic/parser";
import { breakfastFromNotes } from "@/features/operations/logic/breakfast";
describe("breakfast notes", () => {
  it.each(["Breakfast included", "Desayuno incluido", "ארוחת בוקר"])("recognizes %s", note => expect(breakfastFromNotes(note, 2, 1)).toEqual({breakfast_status: "included", breakfast_pax: 3}));
  it.each([null, "Late arrival", "No breakfast", "Breakfast not included", "Sin desayuno", "ללא ארוחת בוקר"])("excludes %s", note => expect(breakfastFromNotes(note, 2, 1).breakfast_pax).toBe(0));
});

it("preserves Notes from the CSV through reservation normalization into breakfast covers", () => {
  const csv = parseCsv('Reservation Number,Guest Name,Check In,LoS,Room Number,Adults / Children / Infants,Notes\nTEST-1,Test Guest,21-09-2026,2,Room 5,2 / 1 / 0,Desayuno incluido');
  const normalized = normalizeReservationRow(csv.rows[0], csv.headers, "check_in");
  expect(normalized.ok).toBe(true);
  if (!normalized.ok) throw new Error(normalized.error);
  const r = normalized.reservation;
  expect(breakfastFromNotes(r.notes, r.adults, r.children)).toEqual({ breakfast_status: "included", breakfast_pax: 3 });
});
