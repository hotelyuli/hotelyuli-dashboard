import { NextResponse, type NextRequest } from "next/server";
import { dailyTasksPayload, type TaskForPush } from "@/features/notifications/payloads";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToHotel, type PushSummary } from "@/lib/push";

// 08:00 Costa Rica open-tasks digest (Vercel Cron "0 14 * * *"; Costa Rica has no DST).
// Requires "Authorization: Bearer $CRON_SECRET" (Vercel Cron sends it; also for curl).
// Each hotel with open tasks gets one push to all its subscribed devices; none when N = 0.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized", hint: secret ? "Send Authorization: Bearer <CRON_SECRET>." : "CRON_SECRET is not set in this deployment." }, { status: 401 });
  }
  try {
    const { data, error } = await createAdminClient()
      .from("tasks").select("hotel_id, title, room_area, priority, created_at")
      .in("status", ["open", "in_progress"]);
    if (error) throw new Error(`load tasks: ${error.message}`);

    const byHotel = new Map<string, TaskForPush[]>();
    for (const task of data ?? []) {
      const list = byHotel.get(task.hotel_id) ?? [];
      list.push({ title: task.title, roomArea: task.room_area, priority: task.priority, createdAt: task.created_at });
      byHotel.set(task.hotel_id, list);
    }

    const totals: PushSummary = { sent: 0, removed: 0, failed: 0, skipped: 0 };
    for (const [hotelId, tasks] of byHotel) {
      const payload = dailyTasksPayload(tasks);
      if (!payload) continue;
      const summary = await sendToHotel(hotelId, payload);
      for (const key of Object.keys(totals) as (keyof PushSummary)[]) totals[key] += summary[key];
    }
    console.log(`[push] daily tasks: ${data?.length ?? 0} open task(s) in ${byHotel.size} hotel(s); sent ${totals.sent}, removed ${totals.removed}, failed ${totals.failed}`);
    return NextResponse.json({ openTasks: data?.length ?? 0, hotels: byHotel.size, ...totals });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[push] daily tasks run failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
