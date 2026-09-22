"use server";

import { tourCommission } from "./logic/tour-commission";
import { revalidatePath } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can, type AppRole } from "@/features/auth/logic/permissions";

async function authorizeWrite() {
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id, role, active, full_name").eq("id", user.id).single();
  if (!profile?.active || !can(profile.role as AppRole, "operations:write")) throw new Error("NOT_AUTHORIZED");
  return { supabase, user, profile, operationDate: formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd") };
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

export async function registerEvent(formData: FormData) {
  const { supabase, user, profile, operationDate } = await authorizeWrite();
  const parsed = eventSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const data = parsed.data;
  const { data: event, error } = await supabase.from("shift_events").insert({
    hotel_id: profile.hotel_id, operation_date: operationDate, event_time: data.eventTime,
    category: data.category, room_area: data.roomArea || null, description: data.description,
    action_taken: data.actionTaken || null, status: data.status, priority: data.priority,
    requires_follow_up: data.requiresFollowUp, created_by: user.id
  }).select("id").single();
  if (error || !event) throw new Error("SAVE_FAILED");

  if (data.requiresFollowUp || data.status !== "completed") {
    const { error: taskError } = await supabase.from("tasks").insert({
      hotel_id: profile.hotel_id, operation_date: operationDate, source_event_id: event.id,
      title: data.description, room_area: data.roomArea || null, priority: data.priority,
      status: "open", created_by: user.id
    });
    if (taskError) throw new Error("TASK_SAVE_FAILED");
  }
  revalidatePath("/events"); revalidatePath("/tasks"); revalidatePath("/dashboard");
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

export async function updateTask(formData: FormData) {
  const { supabase, profile } = await authorizeWrite();
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(["open", "in_progress", "completed", "cancelled"]),
    assignedTo: z.string().trim().max(120)
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const { data, error } = await supabase.from("tasks").update({
    status: parsed.data.status,
    assigned_to: parsed.data.assignedTo || null,
    updated_at: new Date().toISOString()
  }).eq("id", parsed.data.id).eq("hotel_id", profile.hotel_id).select("id").single();
  if (error || !data) throw new Error("SAVE_FAILED");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
