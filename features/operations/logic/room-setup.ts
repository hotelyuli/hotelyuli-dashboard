// Per-room operational fields edited from the Room Board (migrations 0018, 0022).
// "Unassigned" / "Sin definir" are stored as null.

export const HOUSEKEEPERS = ["Marcos", "Jeylin", "Yarliny", "Ismenia", "Evelyn", "Other"] as const;
export type Housekeeper = (typeof HOUSEKEEPERS)[number];

/** Stored keys; must match the DB check constraint (migration 0022). */
export const BED_SETUPS = ["king", "two_twin", "three_twin", "king_twin"] as const;
export type BedSetup = (typeof BED_SETUPS)[number];

/** Label shown in the UI and reports for each stored key. */
const BED_SETUP_LABELS: Record<BedSetup, string> = {
  king: "King",
  two_twin: "2 Twin",
  three_twin: "3 Twin",
  king_twin: "King+Twin"
};

/** Only these rooms can have a bed setup. */
export const BED_SETUP_UNIT_CODES: readonly string[] = ["1", "2", "6", "9", "10", "12", "13", "18"];

export function supportsBedSetup(unitCode: string | null | undefined): boolean {
  return unitCode != null && BED_SETUP_UNIT_CODES.includes(unitCode);
}

export function bedSetupLabel(value: string | null, locale: "es" | "en"): string {
  if (value && value in BED_SETUP_LABELS) return BED_SETUP_LABELS[value as BedSetup];
  return locale === "es" ? "Sin definir" : "Not set";
}
