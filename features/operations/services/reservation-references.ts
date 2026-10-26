import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { reservationSplits, type ReservationSplit, type SplitSource } from "@/features/operations/logic/pax";
import { withActiveReservations } from "@/features/operations/services/active-reservations";

/**
 * reservation id -> Little Hotelier Reservation Number, for the board rows of a day.
 * Pax grouping needs it: two bookings under the same guest name are only the same
 * booking when their reference matches.
 */
export async function reservationReferences(supabase: SupabaseClient<Database>, hotelId: string, reservationIds: (string | null)[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(reservationIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("reservations").select("id, reference").eq("hotel_id", hotelId).in("id", ids);
  if (error) throw new Error(`RESERVATIONS_LOAD_FAILED: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id, row.reference]));
}

const BASE_COLUMNS = "id, reference, arrival_date, adults, children, babies";
const SPLIT_COLUMNS = `${BASE_COLUMNS}, split_adults, split_children, split_babies, split_breakfast`;
type SplitRow = { id: string; reference: string | null; arrival_date: string; adults: number; children: number; babies: number; split_adults?: number | null; split_children?: number | null; split_babies?: number | null; split_breakfast?: boolean | null };

/** Database rows as SplitSource (split columns absent before migration 0033). */
export const splitSources = (rows: SplitRow[]): SplitSource[] => rows.map((row) => ({
  id: row.id, reference: row.reference, arrivalDate: row.arrival_date, adults: row.adults, children: row.children, babies: row.babies,
  splitAdults: row.split_adults ?? null, splitChildren: row.split_children ?? null, splitBabies: row.split_babies ?? null, splitBreakfast: row.split_breakfast ?? null
}));

/**
 * reservation id -> its per-room split (migration 0033), for the given reservations. The other rooms
 * of their bookings (same reference + arrival, active only) are loaded too: a split is only valid
 * when every room of the booking has one. Before 0033 every reservation is "none".
 */
export async function reservationSplitsFor(supabase: SupabaseClient<Database>, hotelId: string, reservationIds: (string | null)[]): Promise<Map<string, ReservationSplit>> {
  const ids = [...new Set(reservationIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const load = async (columns: string) => {
    const own = await supabase.from("reservations").select(columns).eq("hotel_id", hotelId).in("id", ids);
    if (own.error) return { error: own.error, rows: [] as SplitRow[] };
    const rows = own.data as unknown as SplitRow[];
    const references = [...new Set(rows.map((row) => row.reference).filter((reference): reference is string => Boolean(reference?.trim())))];
    if (!references.length) return { error: null, rows };
    const others = await withActiveReservations((table) => supabase.from(table).select(columns).eq("hotel_id", hotelId).in("reference", references));
    if (others.error) return { error: others.error, rows: [] as SplitRow[] };
    const arrivals = new Set(rows.map((row) => `${row.reference}|${row.arrival_date}`));
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const row of others.data as unknown as SplitRow[]) if (arrivals.has(`${row.reference}|${row.arrival_date}`)) byId.set(row.id, row);
    return { error: null, rows: [...byId.values()] };
  };
  let { error, rows } = await load(SPLIT_COLUMNS);
  if (isMissingSchema(error)) ({ error, rows } = await load(BASE_COLUMNS));
  if (error) throw new Error(`RESERVATIONS_LOAD_FAILED: ${error.message}`);
  return reservationSplits(splitSources(rows));
}
