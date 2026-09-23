"use server";

import { tourCommission } from "./logic/tour-commission";
import { revalidatePath } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can, type AppRole } from "@/features/auth/logic/permissions";
import { resolveRoomTokens } from "@/features/operations/logic/room-resolver";
import { applySettlement, supabaseLedger } from "@/features/records/services/settlement";
import { TOUR_INCOME_CATEGORY, TOUR_INCOME_METHOD } from "./logic/tour-commission";
import { runAction, type ActionResult } from "@/lib/action-result";

async function authorizeWrite() {
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id, role, active, full_name").eq("id", user.id).single();
  if (!profile?.active || !can(profile.role as AppRole, "operations:write")) throw new Error("NOT_AUTHORIZED");
  return { supabase, user, profile, operationDate: formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd") };
}

/** Guest currently on today's board for a typed room ("5", "Hab 5", "B3", "20"…); null if none. */
export async function findGuestForRoom(roomNumber: string): Promise<string | null> {
  const { supabase, profile, operationDate } = await authorizeWrite();
  const unitCodes = resolveRoomTokens(z.string().trim().max(20).parse(roomNumber)).unitCodes;
  if (!unitCodes.length) return null;
  const { data: rooms } = await supabase.from("rooms").select("id, sort_order").eq("hotel_id", profile.hotel_id).in("unit_code", unitCodes).order("sort_order");
  if (!rooms?.length) return null;
  const { data: cells } = await supabase.from("daily_operations").select("room_id, guest_name").eq("hotel_id", profile.hotel_id).eq("operation_date", operationDate).in("room_id", rooms.map((room) => room.id)).not("guest_name", "is", null);
  const guestByRoom = new Map((cells ?? []).map((cell) => [cell.room_id, cell.guest_name]));
  for (const room of rooms) {
    const guest = guestByRoom.get(room.id);
    if (guest) return guest;
  }
  return null;
}

const eventSchema = z.object({
  eventTime: z.string().regex(/^\d{2}:\d{2}$/),
  category: z.enum(["arriving", "departure", "guest_request", "guest_complaint", "maintenance", "security", "other"]),
  roomArea: z.string().trim().max(100),
  description: z.string().trim().min(1).max(2000),
  actionTaken: z.string().trim().max(2000),
  status: z.enum(["completed", "temporary_solution", "follow_up", "open"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  requiresFollowUp: z.enum(["true", "false"]).transform((value) => value === "true")
});

/**
 * The incident's follow-up task is created by the shift_events_sync_task trigger
 * (migration 0020) in the same transaction, so incident and task save together.
 * The form sends a client-generated id: a retried submit hits the primary key
 * instead of creating a second incident.
 */
export async function registerEvent(formData: FormData) {
  const { supabase, user, profile, operationDate } = await authorizeWrite();
  const parsed = eventSchema.extend({ clientId: z.string().uuid() }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const data = parsed.data;
  const { error } = await supabase.from("shift_events").insert({
    id: data.clientId,
    hotel_id: profile.hotel_id, operation_date: operationDate, event_time: data.eventTime,
    category: data.category, room_area: data.roomArea || null, description: data.description,
    action_taken: data.actionTaken || null, status: data.status, priority: data.priority,
    requires_follow_up: data.requiresFollowUp, created_by: user.id
  });
  if (error && error.code !== "23505") throw new Error("SAVE_FAILED");
  revalidatePath("/events"); revalidatePath("/tasks"); revalidatePath("/dashboard");
}

const eventUpdateSchema = z.object({
  id: z.string().uuid(),
  status: eventSchema.shape.status,
  priority: eventSchema.shape.priority,
  roomArea: eventSchema.shape.roomArea,
  description: eventSchema.shape.description,
  actionTaken: eventSchema.shape.actionTaken
});

/** Edit / resolve an incident. Its task is closed or reopened by the 0020 trigger. */
export async function updateEvent(formData: FormData): Promise<ActionResult> {
  return runAction("updateEvent", async () => {
    const { supabase, profile } = await authorizeWrite();
    const parsed = eventUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw new Error(`INVALID_INPUT: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
    const d = parsed.data;
    const { data: updated, error } = await supabase.from("shift_events").update({
      status: d.status, priority: d.priority, room_area: d.roomArea || null,
      description: d.description, action_taken: d.actionTaken || null, updated_at: new Date().toISOString()
    }).eq("id", d.id).eq("hotel_id", profile.hotel_id).select("id").single();
    if (error || !updated) throw new Error(`SAVE_FAILED: ${error?.message ?? "incident not updated"}`);
    revalidatePath("/events"); revalidatePath("/tasks"); revalidatePath("/dashboard");
  });
}

const tourSchema = z.object({
  guestName: z.string().trim().min(1).max(120), roomNumber: z.string().trim().max(20),
  operatorName: z.string().trim().min(1).max(120), tourName: z.string().trim().min(1).max(120),
  tourDate: z.string().date(), adults: z.coerce.number().int().min(0), children: z.coerce.number().int().min(0),
  totalPrice: z.coerce.number().min(0).max(1_000_000_000), currency: z.enum(["USD", "CRC"]),
  status: z.enum(["paid", "pending", "cancelled"]), paymentMethod: z.string().trim().max(80).default(""),
  receiptNumber: z.string().trim().max(80).default(""), bookedBy: z.string().trim().min(1).max(120), notes: z.string().trim().max(1000)
});

export async function registerTour(formData: FormData) {
  const { supabase, user, profile, operationDate } = await authorizeWrite();
  const parsed = tourSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const d = parsed.data;
  const payload = { hotel_id: profile.hotel_id, operation_date: operationDate, guest_name: d.guestName, room_number: d.roomNumber || null, operator_name: d.operatorName, tour_name: d.tourName, tour_date: d.tourDate, adults: d.adults, children: d.children, total_price: d.totalPrice, currency: d.currency, commission_amount: tourCommission(d.totalPrice), status: d.status, payment_method: d.paymentMethod || null, receipt_number: d.receiptNumber || null, booked_by: d.bookedBy, notes: d.notes || null, created_by: user.id };
  const { data: tour, error } = await supabase.from("tour_bookings").insert(payload).select("id").single();
  if (error || !tour) throw new Error("SAVE_FAILED");
  const { error: queueError } = await supabase.from("google_sheets_outbox").insert({ hotel_id: profile.hotel_id, entity_type: "tour", entity_id: tour.id, payload });
  if (queueError) throw new Error("QUEUE_FAILED");
  revalidatePath("/tours"); revalidatePath("/dashboard");
}

const tourStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "paid", "cancelled"]),
  reason: z.string().trim().max(500).default("")
});

/**
 * Paid -> exactly one income row for the hotel's commission (idempotent).
 * Leaving paid (pending/cancelled) -> a reversing income row with a mandatory reason.
 * The ledger is written before the status, so a failed status update is healed by a retry.
 */
export async function setTourStatus(formData: FormData): Promise<ActionResult> {
  return runAction("setTourStatus", () => saveTourStatus(formData));
}

async function saveTourStatus(formData: FormData) {
  const { supabase, user, profile, operationDate } = await authorizeWrite();
  const parsed = tourStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const { id, status, reason } = parsed.data;

  const { data: tour, error: tourError } = await supabase
    .from("tour_bookings")
    .select("id, guest_name, room_number, operator_name, tour_name, tour_date, currency, commission_amount")
    .eq("id", id).eq("hotel_id", profile.hotel_id).single();
  if (tourError || !tour) throw new Error(`TOUR_NOT_FOUND: ${tourError?.message ?? id}`);

  await applySettlement({
    ledger: supabaseLedger({ supabase, hotelId: profile.hotel_id, userId: user.id, operationDate }),
    source: { type: "tour", id: tour.id },
    wantPaid: status === "paid",
    payment: {
      amount: Number(tour.commission_amount),
      currency: tour.currency,
      paymentMethod: TOUR_INCOME_METHOD,
      category: TOUR_INCOME_CATEGORY,
      guestName: tour.guest_name,
      roomNumber: tour.room_number,
      referenceNote: `${tour.tour_name} · ${tour.tour_date} · ${tour.operator_name}`
    },
    reason
  });

  const { data: updated, error } = await supabase.from("tour_bookings").update({ status, updated_at: new Date().toISOString() }).eq("id", tour.id).eq("hotel_id", profile.hotel_id).select("id").single();
  if (error || !updated) throw new Error(`SAVE_FAILED: ${error?.message ?? "tour not updated"}`);
  revalidatePath("/tours"); revalidatePath("/income"); revalidatePath("/dashboard");
}

const incomeSchema = z.object({
  roomNumber: z.string().trim().max(20), guestName: z.string().trim().min(1).max(120),
  paid: z.enum(["true", "false"]).transform((value) => value === "true"), category: z.string().trim().min(1).max(80),
  amount: z.coerce.number().min(0), currency: z.enum(["USD", "CRC"]), paymentMethod: z.string().trim().min(1).max(80),
  referenceNote: z.string().trim().max(1000)
});

export async function registerIncome(formData: FormData) {
  const { supabase, user, profile, operationDate } = await authorizeWrite();
  const parsed = incomeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const d = parsed.data;
  const payload = { hotel_id: profile.hotel_id, operation_date: operationDate, room_number: d.roomNumber || null, guest_name: d.guestName, paid: d.paid, category: d.category, amount: d.amount, currency: d.currency, payment_method: d.paymentMethod, reference_note: d.referenceNote || null, created_by: user.id };
  const { data: income, error } = await supabase.from("income_entries").insert(payload).select("id").single();
  if (error || !income) throw new Error("SAVE_FAILED");
  const { error: queueError } = await supabase.from("google_sheets_outbox").insert({ hotel_id: profile.hotel_id, entity_type: "income", entity_id: income.id, payload });
  if (queueError) throw new Error("QUEUE_FAILED");
  revalidatePath("/income"); revalidatePath("/dashboard");
}

/**
 * Saves a task's status from the inline /tasks editor. This writes tasks directly,
 * so it depends on the tasks UPDATE policy (0025); the incident dialog changes tasks
 * through the SECURITY DEFINER sync trigger instead. Returns the real error, and
 * confirms the status the database actually stored.
 */
export async function updateTask(formData: FormData): Promise<ActionResult> {
  return runAction("updateTask", async () => {
    const { supabase, profile } = await authorizeWrite();
    const parsed = z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "in_progress", "completed", "cancelled"])
    }).safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw new Error(`INVALID_INPUT: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
    const { data, error } = await supabase.from("tasks").update({
      status: parsed.data.status,
      updated_at: new Date().toISOString()
    }).eq("id", parsed.data.id).eq("hotel_id", profile.hotel_id).select("id, status");
    if (error) {
      const hint = /row-level security/i.test(error.message) ? " (the tasks update policy is missing: run migration 0025)" : "";
      throw new Error(`SAVE_FAILED: ${error.message}${hint}`);
    }
    if (!data?.length) throw new Error("NOT_UPDATED: the task was not found or you are not allowed to edit it");
    if (data[0].status !== parsed.data.status) throw new Error(`NOT_PERSISTED: the database kept status "${data[0].status}"`);
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
  });
}
