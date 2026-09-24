/** Twenty percent of the total, rounded to the nearest currency cent. */
export function tourCommission(total: number): number {
  if (!Number.isFinite(total) || total < 0 || total > 1_000_000_000) throw new Error("INVALID_TOUR_PRICE");
  const cents = Math.round((total + Number.EPSILON) * 100);
  return Math.round(cents / 5) / 100;
}

/** A paid tour books only the hotel's commission as income; the travel office collects the tour price. */
export const TOUR_INCOME_CATEGORY = "Tour commission";
export const TOUR_INCOME_METHOD = "Agency";

/** Tour types offered in Register tour and Edit tour (free text is allowed via "Other"). */
export const TOUR_TYPES = ["Whale Watching", "Isla del Caño Snorkeling", "Corcovado", "Cataratas Nauyaca", "Alturas Wildlife Sanctuary", "Manglar de Sierpe", "Transfer", "Sound Healing", "Other"] as const;
