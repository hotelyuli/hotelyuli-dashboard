"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { runAction, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";

const subscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) })
});
const endpointSchema = subscriptionSchema.shape.endpoint;

const NOT_ENABLED = "NOT_ENABLED: notifications need migration 0031 (push_subscriptions)";
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";

async function sessionProfile() {
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id, active").eq("id", user.id).single();
  if (!profile?.active) throw new Error("NOT_AUTHORIZED");
  return { supabase, user, hotelId: profile.hotel_id };
}

/**
 * Saves this device's push subscription for the signed-in user (hotel and user come
 * from the session). Safe to call repeatedly. On a shared device the endpoint may
 * still belong to the previous user; that row is replaced (service role, by endpoint).
 */
export async function subscribePush(subscriptionJson: unknown): Promise<ActionResult> {
  return runAction("subscribePush", async () => {
    const { supabase, user, hotelId } = await sessionProfile();
    const parsed = subscriptionSchema.safeParse(subscriptionJson);
    if (!parsed.success) throw new Error("INVALID_INPUT");
    const { endpoint, keys } = parsed.data;
    const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 500) || null;
    const row = { hotel_id: hotelId, user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent };

    const { error: clearError } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
    if (isMissingTable(clearError?.code)) throw new Error(NOT_ENABLED);
    let { error } = await supabase.from("push_subscriptions").insert(row);
    if (error?.code === "23505") {
      await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
      ({ error } = await supabase.from("push_subscriptions").insert(row));
    }
    if (isMissingTable(error?.code)) throw new Error(NOT_ENABLED);
    if (error) throw new Error(`SAVE_FAILED: ${error.message}`);
  });
}

export async function unsubscribePush(endpoint: string): Promise<ActionResult> {
  return runAction("unsubscribePush", async () => {
    const { supabase, user } = await sessionProfile();
    const parsed = endpointSchema.safeParse(endpoint);
    if (!parsed.success) throw new Error("INVALID_INPUT");
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data).eq("user_id", user.id);
    if (error && !isMissingTable(error.code)) throw new Error(`SAVE_FAILED: ${error.message}`);
  });
}
