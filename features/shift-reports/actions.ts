"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can, type AppRole } from "@/features/auth/logic/permissions";
import { reportInput, canClose, type ReportInput } from "./logic";
import { requestShiftSummary } from "./ai";
import { settledTotals } from "@/features/records/logic/settlement";
import type { Json } from "@/lib/db/database.types";

async function context(input: ReportInput) {
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id,role,active").eq("id", user.id).single();
  if (!profile?.active || !can(profile.role as AppRole, "operations:write")) throw new Error("NOT_AUTHORIZED");
  const hotel = profile.hotel_id;
  const [events, tasks, operations, income, tours] = await Promise.all([
    supabase.from("shift_events").select("id,event_time,category,room_area,description,action_taken,status,priority").eq("hotel_id", hotel).eq("operation_date", input.date).order("event_time"),
    supabase.from("tasks").select("id,title,room_area,status,assigned_to,due_at,priority").eq("hotel_id", hotel).in("status", ["open", "in_progress"]).order("id"),
    supabase.from("daily_operations").select("operational_status,breakfast_status,breakfast_pax").eq("hotel_id", hotel).eq("operation_date", input.date),
    supabase.from("income_entries").select("currency,amount,paid,entry_type").eq("hotel_id", hotel).eq("operation_date", input.date),
    supabase.from("tour_bookings").select("id,tour_name,tour_date,total_price,currency,commission_amount").eq("hotel_id",hotel).eq("operation_date",input.date).neq("status","cancelled").order("id")
  ]);
  if ([events,tasks,operations,income,tours].some(r => r.error)) throw new Error("SOURCE_LOAD_FAILED");
  const settled = settledTotals((income.data ?? []).map(r => ({ amount: r.amount, currency: r.currency, paid: r.paid, entryType: r.entry_type })));
  const selected = (events.data ?? []).filter(e => input.eventIds.includes(e.id));
  if (selected.length !== new Set(input.eventIds).size) throw new Error("SOURCE_CHANGED");
  if ((tasks.data?.length ?? 0) > 100 || (events.data?.length ?? 0) >= 1000) throw new Error("SOURCE_TOO_LARGE");
  const source = { date: input.date, shift: input.shift, receptionist: input.receptionist, selectedEvents: selected,
    pendingTasks: tasks.data, receptionistNotes: input.notes,
    confirmations: { breakfastReportSent: input.breakfastSent, tomorrowArrivalsContacted: input.arrivalsContacted, takeawayBreakfastsReady: input.takeawayReady },
    dailyContext: { toursRecordedToday: tours.data, plannedArrivals: operations.data?.filter(r => r.operational_status === "check_in").length ?? 0,
      staying: operations.data?.filter(r => r.operational_status === "staying").length ?? 0,
      includedBreakfastCovers: operations.data?.filter(r => r.breakfast_status === "included").reduce((n,r) => n+r.breakfast_pax,0) ?? 0,
      recordedPaidIncomeUSD: settled.USD,
      recordedPaidIncomeCRC: settled.CRC }
  };
  return { supabase, user, hotel, source, sourceHash: createHash("sha256").update(JSON.stringify(source)).digest("hex") };
}
function publicError(error: unknown) {
  const code = error instanceof Error ? error.message : "SAVE_FAILED";
  return ["NOT_AUTHORIZED","AI_NOT_CONFIGURED","AI_UNAVAILABLE","AI_INCOMPLETE","SOURCE_LOAD_FAILED","SOURCE_CHANGED","SOURCE_TOO_LARGE","ALREADY_CLOSED","CONFLICT","REVIEW_REQUIRED"].includes(code) ? code : "SAVE_FAILED";
}
export async function generateShiftSummary(raw: ReportInput) {
  try {
    const input = reportInput.parse(raw);
    const { supabase, hotel, source, sourceHash } = await context(input);
    const { data, error } = await supabase.from("shift_reports").select("status").eq("hotel_id",hotel).eq("operation_date",input.date).eq("shift",input.shift).maybeSingle();
    if (error) throw new Error("SOURCE_LOAD_FAILED");
    if (data?.status === "closed") throw new Error("ALREADY_CLOSED");
    return { ok: true as const, text: await requestShiftSummary(source), sourceHash };
  } catch (e) { return { ok: false as const, error: publicError(e) }; }
}
export async function saveShiftReport(raw: ReportInput, text: string, revision: number, close: boolean, sourceHash: string | null) {
  try {
    const input = reportInput.parse(raw);
    const finalText = z.string().trim().min(20).max(16000).parse(text);
    z.number().int().min(0).parse(revision);
    if (close && !canClose(input)) throw new Error("REVIEW_REQUIRED");
    const ctx = await context(input);
    if (sourceHash && sourceHash !== ctx.sourceHash) throw new Error("SOURCE_CHANGED");
    const payload = { hotel_id: ctx.hotel, operation_date: input.date, shift: input.shift, receptionist: input.receptionist,
      final_report_en: finalText, inputs: input as unknown as Json, source_snapshot: ctx.source as unknown as Json,
      status: close ? "closed" as const : "draft" as const, revision: revision + 1, updated_by: ctx.user.id,
      closed_at: close ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
    const result = revision === 0
      ? await ctx.supabase.from("shift_reports").insert({ ...payload, created_by: ctx.user.id }).select("revision,status").single()
      : await ctx.supabase.from("shift_reports").update(payload).eq("hotel_id",ctx.hotel).eq("operation_date",input.date).eq("shift",input.shift).eq("revision",revision).eq("status","draft").select("revision,status").single();
    if (result.error || !result.data) throw new Error(result.error?.code === "23505" || result.error?.code === "PGRST116" ? "CONFLICT" : "SAVE_FAILED");
    revalidatePath("/reports"); revalidatePath("/dashboard");
    return { ok: true as const, revision: result.data.revision, closed: result.data.status === "closed" };
  } catch(e) { return { ok: false as const, error: publicError(e) }; }
}
