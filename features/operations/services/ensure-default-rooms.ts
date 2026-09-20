import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { buildDefaultRooms } from "@/features/operations/logic/default-rooms";

type Client = SupabaseClient<Database>;

export async function ensureDefaultRooms(params: {
  supabase: Client;
  hotelId: string;
  role: Database["public"]["Enums"]["app_role"];
}) {
  const { supabase, hotelId, role } = params;
  if (!hotelId || role !== "owner") return;

  const { count, error: countError } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId);

  if (countError || (count ?? 0) > 0) return;

  const { error } = await supabase
    .from("rooms")
    .upsert(buildDefaultRooms(hotelId), {
      onConflict: "hotel_id,unit_code",
      ignoreDuplicates: true
    });

  if (error) throw new Error(`ROOM_SEED_FAILED:${error.message}`);
}
