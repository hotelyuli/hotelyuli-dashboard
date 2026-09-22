// Per-room operational fields edited from the Room Board (migration 0018).
// "Unassigned" / "Sin definir" are stored as null.

export const HOUSEKEEPERS = ["Marcos", "Jeylin", "Yarliny", "Ismenia", "Evelyn", "Other"] as const;
export type Housekeeper = (typeof HOUSEKEEPERS)[number];

export const BED_SETUPS = ["king", "two_twin"] as const;
export type BedSetup = (typeof BED_SETUPS)[number];

/** Only these rooms can be set up either as one king or as two twins. */
export const BED_SETUP_UNIT_CODES: readonly string[] = ["1", "2", "6", "9", "10", "12", "13", "18"];

export function supportsBedSetup(unitCode: string | null | undefined): boolean {
  return unitCode != null && BED_SETUP_UNIT_CODES.includes(unitCode);
}

export function bedSetupLabel(value: string | null, locale: "es" | "en"): string {
  if (value === "king") return "King";
  if (value === "two_twin") return "2 Twin";
  return locale === "es" ? "Sin definir" : "Not set";
}
