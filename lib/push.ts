import { after } from "next/server";
import webpush from "web-push";
import { vapidEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { incidentPayload, type IncidentForPush, type PushPayload } from "@/features/notifications/payloads";

/**
 * Web Push sender (server-only, service role). Nothing here ever throws into the
 * caller: a failed push must not fail or slow an incident save. Expired devices
 * (404/410) are deleted; other failures bump failure_count. The private key is
 * passed to web-push only and never logged.
 */
export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };
export type PushOutcome = "sent" | "removed" | "failed" | "skipped";
export type PushSummary = { sent: number; removed: number; failed: number; skipped: number };

const TTL_SECONDS = 3600;

export async function sendPush(subscription: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  try {
    const vapid = vapidEnv();
    if (!vapid.ok) return "skipped";
    const admin = createAdminClient();
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { TTL: TTL_SECONDS, urgency: payload.urgency, vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey } }
      );
      await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", subscription.id);
      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        return "removed";
      }
      console.warn(`[push] send failed (status ${status ?? "none"}) for subscription ${subscription.id}`);
      await admin.from("push_subscriptions").update({ failure_count: subscription.failure_count + 1 }).eq("id", subscription.id);
      return "failed";
    }
  } catch (error) {
    console.error(`[push] ${error instanceof Error ? error.message : String(error)}`);
    return "failed";
  }
}

/** Sends one payload to every subscribed device of a hotel (any role, the author included). */
export async function sendToHotel(hotelId: string, payload: PushPayload): Promise<PushSummary> {
  const summary: PushSummary = { sent: 0, removed: 0, failed: 0, skipped: 0 };
  try {
    const vapid = vapidEnv();
    if (!vapid.ok) {
      console.warn(`[push] not sent - missing env: ${vapid.missing.join(", ")}`);
      return summary;
    }
    const { data, error } = await createAdminClient().from("push_subscriptions").select("id, endpoint, p256dh, auth, failure_count").eq("hotel_id", hotelId);
    if (error) throw new Error(`load subscriptions: ${error.message}`);
    const results = await Promise.allSettled((data ?? []).map((subscription) => sendPush(subscription, payload)));
    for (const result of results) summary[result.status === "fulfilled" ? result.value : "failed"] += 1;
  } catch (error) {
    console.error(`[push] ${error instanceof Error ? error.message : String(error)}`);
  }
  return summary;
}

export async function notifyNewIncident(hotelId: string, incident: IncidentForPush): Promise<void> {
  const summary = await sendToHotel(hotelId, incidentPayload(incident));
  if (summary.failed) console.warn(`[push] incident ${incident.id}: ${summary.sent} sent, ${summary.failed} failed`);
}

/**
 * Queues the new-incident push to run after the response is sent (next/server after()),
 * so the save never waits on it. Outside a request scope it falls back to fire-and-forget.
 */
export function notifyNewIncidentSoon(hotelId: string, incident: IncidentForPush): void {
  const run = () => notifyNewIncident(hotelId, incident).catch(() => {});
  try {
    after(run);
  } catch {
    void run();
  }
}
