import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

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
