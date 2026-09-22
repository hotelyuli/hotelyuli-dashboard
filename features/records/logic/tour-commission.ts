export const TOUR_OPERATORS = ["Ballena Tours", "Ronald Hermosa", "Costa Rica Dive and Surf"] as const;

/** Twenty percent of the total, rounded to the nearest currency cent. */
export function tourCommission(total: number): number {
  if (!Number.isFinite(total) || total < 0 || total > 1_000_000_000) throw new Error("INVALID_TOUR_PRICE");
  const cents = Math.round((total + Number.EPSILON) * 100);
  return Math.round(cents / 5) / 100;
}
