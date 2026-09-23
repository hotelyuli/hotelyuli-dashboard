"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can, type AppRole } from "@/features/auth/logic/permissions";
import { reportInput, canClose, type ReportInput } from "./logic";
import { unitLabel, type ReportFacts } from "./template";
import { composeShiftReport } from "./ai";
import type { Json } from "@/lib/db/database.types";

async function context(input: ReportInput) {
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id,role,active").eq("id", user.id).single();
  if (!profile?.active || !can(profile.role as AppRole, "operations:write")) throw new Error("NOT_AUTHORIZED");
  const hotel = profile.hotel_id;
  const [rooms, events, openTasks, operations, departures, tours, breakfastReports] = await Promise.all([
    supabase.from("rooms").select("id,unit_code").eq("hotel_id", hotel),
    supabase.from("shift_events").select("id,event_time,category,room_area,description,action_taken,status,priority").eq("hotel_id", hotel).eq("operation_date", input.date).order("event_time").order("id"),
    supabase.from("tasks").select("id,title,room_area,status,assigned_to,operation_date").eq("hotel_id", hotel).in("status", ["open", "in_progress"]).order("created_at").order("id"),
    supabase.from("daily_operations").select("room_id,operational_status,same_day_arrival,breakfast_status,breakfast_pax,breakfast_to_go,breakfast_to_go_time").eq("hotel_id", hotel).eq("operation_date", input.date),
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("hotel_id", hotel).eq("departure_date", input.date),
    supabase.from("tour_bookings").select("id,room_number,tour_name,tour_date,operator_name,adults,children,status").eq("hotel_id", hotel).eq("operation_date", input.date).order("created_at").order("id"),
    supabase.from("report_snapshots").select("id", { count: "exact", head: true }).eq("hotel_id", hotel).eq("operation_date", input.date).eq("report_kind", "breakfast")
  ]);
  const failed = [rooms, events, openTasks, operations, departures, tours, breakfastReports].find((result) => result.error);
  if (failed?.error) throw new Error(`SOURCE_LOAD_FAILED: ${failed.error.message}`);
  if ((openTasks.data?.length ?? 0) > 200 || (events.data?.length ?? 0) >= 1000) throw new Error("SOURCE_TOO_LARGE");

  const selected = (events.data ?? []).filter((event) => input.eventIds.includes(event.id));
  if (selected.length !== new Set(input.eventIds).size) throw new Error("SOURCE_CHANGED");
  const { data: linkedTasks, error: linkedError } = selected.length
    ? await supabase.from("tasks").select("source_event_id,status,assigned_to").eq("hotel_id", hotel).in("source_event_id", selected.map((event) => event.id))
    : { data: [], error: null };
  if (linkedError) throw new Error(`SOURCE_LOAD_FAILED: ${linkedError.message}`);
  const taskByEvent = new Map((linkedTasks ?? []).map((task) => [task.source_event_id, task]));

  const unitById = new Map((rooms.data ?? []).map((room) => [room.id, room.unit_code]));
  const unit = (roomId: string) => unitLabel(unitById.get(roomId) ?? "?");
  const byUnit = <T extends { room_id: string }>(rows: T[]) => [...rows].sort((a, b) => (unitById.get(a.room_id) ?? "").localeCompare(unitById.get(b.room_id) ?? "", "en", { numeric: true }));
  const board = operations.data ?? [];

  const source: ReportFacts = {
    date: input.date,
    shift: input.shift,
    receptionist: input.receptionist,
    incidents: selected.map((event) => {
      const task = taskByEvent.get(event.id);
      return { time: event.event_time, category: event.category, roomArea: event.room_area, description: event.description, actionTaken: event.action_taken, status: event.status, priority: event.priority, task: task ? { status: task.status, assignedTo: task.assigned_to } : null };
    }),
    arrivals: { count: board.filter((row) => row.operational_status === "check_in").length, sameDayTurnovers: board.filter((row) => row.operational_status === "check_in" && row.same_day_arrival).length },
    departures: { count: departures.count ?? 0 },
    takeawayBreakfasts: byUnit(board.filter((row) => row.breakfast_status === "included" && row.breakfast_to_go)).map((row) => ({ unit: unit(row.room_id), pax: row.breakfast_pax, time: row.breakfast_to_go_time })),
    tours: (tours.data ?? []).map((tour) => ({ room: tour.room_number, tour: tour.tour_name, tourDate: tour.tour_date, operator: tour.operator_name, pax: tour.adults + tour.children, status: tour.status })),
    openTasks: (openTasks.data ?? []).map((task) => ({ title: task.title, roomArea: task.room_area, status: task.status, assignedTo: task.assigned_to, carriedOver: task.operation_date < input.date })),
    confirmations: { breakfastSent: input.breakfastSent, arrivalsContacted: input.arrivalsContacted, takeawayReady: input.takeawayReady },
    breakfastReportSaved: (breakfastReports.count ?? 0) > 0,
    notes: input.notes
  };
  return { supabase, user, hotel, source, sourceHash: createHash("sha256").update(JSON.stringify(source)).digest("hex") };
}
const PUBLIC_CODES = ["NOT_AUTHORIZED", "SOURCE_LOAD_FAILED", "SOURCE_CHANGED", "SOURCE_TOO_LARGE", "ALREADY_CLOSED", "CONFLICT", "REVIEW_REQUIRED", "SAVE_FAILED"];
/** Known codes pass through with their detail (e.g. "SOURCE_LOAD_FAILED: <db message>"); anything else is logged and generalised. */
function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (PUBLIC_CODES.some((code) => message === code || message.startsWith(`${code}:`))) return message;
  console.error("[shift-reports] unexpected error", error);
  return `SAVE_FAILED: ${message}`;
}
/**
 * Builds the English report from saved facts + the receptionist's notes: Claude writes the
 * narrative when ANTHROPIC_API_KEY is set, otherwise (or on any AI failure) the structured
 * report is returned, so generating never fails.
 */
export async function generateShiftReport(raw: ReportInput) {
  try {
    const input = reportInput.parse(raw);
    const { supabase, hotel, source, sourceHash } = await context(input);
    const { data, error } = await supabase.from("shift_reports").select("status").eq("hotel_id",hotel).eq("operation_date",input.date).eq("shift",input.shift).maybeSingle();
    if (error) throw new Error(`SOURCE_LOAD_FAILED: ${error.message}`);
    if (data?.status === "closed") throw new Error("ALREADY_CLOSED");
    const report = await composeShiftReport(source);
    return { ok: true as const, text: report.text, sourceHash, generator: report.generator, model: report.model, warning: report.warning };
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
    if (result.error || !result.data) throw new Error(result.error?.code === "23505" || result.error?.code === "PGRST116" ? "CONFLICT" : `SAVE_FAILED: ${result.error?.message ?? "no row returned"}`);
    revalidatePath("/reports"); revalidatePath("/dashboard");
    return { ok: true as const, revision: result.data.revision, closed: result.data.status === "closed" };
  } catch(e) { return { ok: false as const, error: publicError(e) }; }
}
