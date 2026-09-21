import { describe, it, expect } from "vitest";
import { breakfastFromNotes } from "@/features/operations/logic/breakfast";
describe("breakfast notes", () => {
  it.each(["Breakfast included", "Desayuno incluido", "ארוחת בוקר"])("recognizes %s", note => expect(breakfastFromNotes(note, 2, 1)).toEqual({breakfast_status: "included", breakfast_pax: 3}));
  it.each([null, "Late arrival", "No breakfast", "Breakfast not included", "Sin desayuno", "ללא ארוחת בוקר"])("excludes %s", note => expect(breakfastFromNotes(note, 2, 1).breakfast_pax).toBe(0));
});
