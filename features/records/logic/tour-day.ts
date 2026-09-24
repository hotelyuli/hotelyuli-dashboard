/**
 * The day shown on Booked tours: `?date=YYYY-MM-DD` when it is a real calendar date,
 * otherwise today (Costa Rica). Only filters the view; every tour stays saved.
 */
export function selectedTourDay(raw: string | string[] | undefined, today: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : today;
}
