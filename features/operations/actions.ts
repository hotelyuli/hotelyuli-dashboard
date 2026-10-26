"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { flushSheetsSoon } from "@/features/sheets/export";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { can } from "@/features/auth/logic/permissions";
import type { AppRole } from "@/features/auth/logic/permissions";
import { materializeUnit, type ReservationForBoard } from "@/features/operations/logic/board";
import { BED_SETUPS, HOUSEKEEPERS, supportsBedSetup, type BedSetup } from "@/features/operations/logic/room-setup";
import { applySettlement, supabaseLedger } from "@/features/records/services/settlement";
import { runAction, type ActionResult } from "@/lib/action-result";
import { withActiveReservations } from "@/features/operations/services/active-reservations";
import { CLEANING_ACTIONS } from "@/features/operations/logic/cleaning";
import { breakfastFromNotes } from "@/features/operations/logic/breakfast";
import { reservationSplits, type Pax3, type SplitState } from "@/features/operations/logic/pax";
import { splitSources } from "@/features/operations/services/reservation-references";
import { isMissingSchema } from "@/lib/db/schema-errors";

async function authorizeOperationsWrite() {
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id, role, active").eq("id", user.id).single();
  if (!profile?.active || !can(profile.role as AppRole, "operations:write")) throw new Error("NOT_AUTHORIZED");
  return { supabase, user, hotelId: profile.hotel_id };
}

const updateCellSchema = z.object({
  rowId: z.string().uuid(),
  guestName: z.string().trim().max(120),
  carPlate: z.string().trim().max(20),
  bookingChannel: z.string().trim().max(60),
  notes: z.string().trim().max(1000),
  breakfastStatus: z.enum(["included", "not_included"]),
  breakfastPax: z.coerce.number().int().min(0),
  breakfastToGo: z.enum(["true", "false"]).transform((value) => value === "true"),
  breakfastNotes: z.string().trim().max(300),
  paymentStatus: z.enum(["", "paid", "pending", "partial"]),
  paymentMethod: z.string().trim().max(80),
  outstandingBalance: z.string().trim(),
  currency: z.enum(["USD", "CRC", ""]),
  housekeeper: z.enum(["", ...HOUSEKEEPERS]),
  bedSetup: z.enum(["", ...BED_SETUPS]),
  breakfastToGoTime: z.string().regex(/^(\d{2}:\d{2})?$/),
  /** Amount collected; only read when the status changes to paid. */
  amountReceived: z.string().trim().default(""),
  /** Why a paid stay is being un-paid; only read when the status leaves paid. */
  paymentReason: z.string().trim().max(500).default("")
});

export async function updateOperationCell(formData: FormData): Promise<ActionResult> {
  return runAction("updateOperationCell", () => saveOperationCell(formData));
}

async function saveOperationCell(formData: FormData) {
  const { supabase, user, hotelId } = await authorizeOperationsWrite();
  const parsed = updateCellSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(`INVALID_INPUT: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  const data = parsed.data;
  let outstandingBalance = data.outstandingBalance === "" ? null : Number.parseFloat(data.outstandingBalance);

  const { data: current, error: currentError } = await supabase.from("daily_operations").select("room_id, reservation_id, payment_status, guest_name, operation_date").eq("id", data.rowId).eq("hotel_id", hotelId).single();
  if (!current) throw new Error(`ROW_NOT_FOUND: ${currentError?.message ?? data.rowId}`);
  const { data: room } = await supabase.from("rooms").select("unit_code, display_name").eq("id", current.room_id).eq("hotel_id", hotelId).single();

  // Bed setup only applies to the convertible rooms; anything else is stored as null.
  const bedSetup: BedSetup | null = data.bedSetup && supportsBedSetup(room?.unit_code) ? data.bedSetup : null;

  // Marking the stay paid books exactly one income row per reservation; leaving
  // paid books a reversing row. The ledger is written before the board row.
  const becomesPaid = data.paymentStatus === "paid" && current.payment_status !== "paid";
  const leavesPaid = current.payment_status === "paid" && data.paymentStatus !== "paid";
  if (becomesPaid && !data.currency) throw new Error("CURRENCY_REQUIRED: choose USD or CRC to mark paid");
  if (becomesPaid || leavesPaid) {
    const amountReceived = Number.parseFloat(data.amountReceived);
    await applySettlement({
      ledger: supabaseLedger({ supabase, hotelId, userId: user.id, operationDate: current.operation_date }),
      source: { type: "accommodation", id: current.reservation_id ?? data.rowId },
      wantPaid: becomesPaid,
      payment: becomesPaid && data.currency ? {
        amount: amountReceived,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        category: "Accommodation",
        guestName: data.guestName || current.guest_name || "—",
        roomNumber: room?.display_name ?? null,
        referenceNote: null
      } : undefined,
      reason: data.paymentReason
    });
    if (becomesPaid) {
      outstandingBalance = 0;
      if (current.reservation_id) {
        const { error: reservationError } = await supabase.from("reservations").update({ outstanding_balance: 0, updated_at: new Date().toISOString() }).eq("id", current.reservation_id).eq("hotel_id", hotelId);
        // Income is already booked; a stale reservation balance only affects future days' board rows.
        if (reservationError) console.error(`[updateOperationCell] reservation balance not cleared: ${reservationError.message}`);
      }
    }
  }

  const { data: updated, error } = await supabase
    .from("daily_operations")
    .update({
      guest_name: data.guestName || null,
      car_plate: data.carPlate || null,
      booking_channel: data.bookingChannel || null,
      notes: data.notes || null,
      breakfast_status: data.breakfastStatus,
      breakfast_pax: data.breakfastPax,
      breakfast_to_go: data.breakfastToGo,
      breakfast_notes: data.breakfastNotes || null,
      payment_status: data.paymentStatus || null,
      payment_method: data.paymentMethod || null,
      outstanding_balance: outstandingBalance,
      currency: data.currency || null,
      housekeeper: data.housekeeper || null,
      bed_setup: bedSetup,
      breakfast_to_go_time: data.breakfastToGo && data.breakfastToGoTime ? data.breakfastToGoTime : null,
      manually_modified: true,
      updated_at: new Date().toISOString()
    })
    .eq("id", data.rowId)
    .eq("hotel_id", hotelId)
    .select("id")
    .single();
  if (error || !updated) throw new Error(`SAVE_FAILED: ${error?.message ?? "row not updated"}`);

  revalidatePath("/operations");
  revalidatePath("/dashboard");
  revalidatePath("/breakfast");
  revalidatePath("/housekeeping");
  revalidatePath("/income");
  // A stay marked paid / un-paid queued an income row: send it to Google Sheets now.
  after(flushSheetsSoon);
}

const cleaningSchema = z.object({ rowId: z.string().uuid(), action: z.enum(["mark_ready", "pass_inspection"]) });

/**
 * Housekeeping work board: advance a room's cleaning status one step. The update
 * only matches when the room is still in the expected state, so double clicks or
 * two people acting at once cannot skip a step. It deliberately does not set
 * manually_modified, so the board can still be re-materialized from imports.
 */
export async function advanceCleaningStatus(formData: FormData): Promise<ActionResult> {
  return runAction("advanceCleaningStatus", async () => {
    const { supabase, hotelId } = await authorizeOperationsWrite();
    const parsed = cleaningSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw new Error("INVALID_INPUT");
    const step = CLEANING_ACTIONS[parsed.data.action];
    const { data: updated, error } = await supabase
      .from("daily_operations")
      .update({ cleaning_status: step.to, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.rowId)
      .eq("hotel_id", hotelId)
      .eq("cleaning_status", step.from)
      .select("id");
    if (error) throw new Error(`SAVE_FAILED: ${error.message}`);
    if (!updated?.length) throw new Error("STATUS_CHANGED: the room is no longer in that state; the page will refresh");
    revalidatePath("/housekeeping");
  });
}

const moveGuestSchema = z.object({ rowId: z.string().uuid(), targetRoomId: z.string().uuid() });

export async function moveGuest(formData: FormData) {
  const { supabase, hotelId } = await authorizeOperationsWrite();
  const parsed = moveGuestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");

  const { data: sourceRow } = await supabase
    .from("daily_operations")
    .select("id, room_id, operation_date, reservation_id")
    .eq("id", parsed.data.rowId)
    .eq("hotel_id", hotelId)
    .single();
  if (!sourceRow?.reservation_id) throw new Error("NO_ACTIVE_RESERVATION");
  if (sourceRow.room_id === parsed.data.targetRoomId) throw new Error("SAME_ROOM");

  const { error } = await supabase
    .from("reservations")
    .update({ room_id: parsed.data.targetRoomId, updated_at: new Date().toISOString() })
    .eq("id", sourceRow.reservation_id)
    .eq("hotel_id", hotelId);
  if (error) throw new Error("SAVE_FAILED");

  await recomputeRooms({ supabase, hotelId, operationDate: sourceRow.operation_date, roomIds: [sourceRow.room_id, parsed.data.targetRoomId] });
  revalidatePath("/operations");
  revalidatePath("/dashboard");
}

const swapRoomsSchema = z.object({ rowIdA: z.string().uuid(), rowIdB: z.string().uuid() });

export async function swapRooms(formData: FormData) {
  const { supabase, hotelId } = await authorizeOperationsWrite();
  const parsed = swapRoomsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");

  const { data: rows } = await supabase
    .from("daily_operations")
    .select("id, room_id, operation_date, reservation_id")
    .in("id", [parsed.data.rowIdA, parsed.data.rowIdB])
    .eq("hotel_id", hotelId);
  if (!rows || rows.length !== 2) throw new Error("ROWS_NOT_FOUND");
  const [a, b] = rows;
  if (a.operation_date !== b.operation_date) throw new Error("DATE_MISMATCH");

  if (a.reservation_id) {
    await supabase.from("reservations").update({ room_id: b.room_id, updated_at: new Date().toISOString() }).eq("id", a.reservation_id);
  }
  if (b.reservation_id) {
    await supabase.from("reservations").update({ room_id: a.room_id, updated_at: new Date().toISOString() }).eq("id", b.reservation_id);
  }

  await recomputeRooms({ supabase, hotelId, operationDate: a.operation_date, roomIds: [a.room_id, b.room_id] });
  revalidatePath("/operations");
  revalidatePath("/dashboard");
}

const reviewSchema = z.object({ reservationId: z.string().uuid(), decision: z.enum(["confirm", "restore"]) });

/**
 * Review panel for reservations an import retired or flagged (migration 0032).
 * confirm: it really is gone from that room – stays retired (a "moved in LH" row is retired as moved).
 * restore: it does count – active again, and the import never retires it again; its room's board
 * row for today is rebuilt from the reservations that count.
 */
export async function reviewRetiredReservation(formData: FormData): Promise<ActionResult> {
  return runAction("reviewRetiredReservation", async () => {
    const { supabase, user, hotelId } = await authorizeOperationsWrite();
    const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw new Error("INVALID_INPUT");
    const { reservationId, decision } = parsed.data;
    const { data: reservation, error: loadError } = await supabase.from("reservations").select("id, room_id, review_flag, retired_at").eq("id", reservationId).eq("hotel_id", hotelId).single();
    if (loadError || !reservation) throw new Error(`RESERVATION_NOT_FOUND: ${loadError?.message ?? reservationId}`);
    const now = new Date().toISOString();
    const review = { reviewed_at: now, reviewed_by: user.id, updated_at: now };
    const change = decision === "restore"
      ? { ...review, retired_at: null, retired_reason: null, retired_by_import_id: null, retired_by: null, review_flag: null, review_flag_detail: null, flagged_by_import_id: null }
      : reservation.review_flag === "moved_in_lh"
        ? { ...review, retired_at: now, retired_reason: "moved_in_lh" as const, retired_by: user.id, review_flag: null }
        : review;
    const { error } = await supabase.from("reservations").update(change).eq("id", reservationId).eq("hotel_id", hotelId);
    if (error) throw new Error(`SAVE_FAILED: ${error.message}`);
    const today = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
    await recomputeRooms({ supabase, hotelId, operationDate: today, roomIds: [reservation.room_id] });
    revalidatePath("/operations");
    revalidatePath("/dashboard");
  });
}

export async function getRowHistory(rowId: string) {
  const { supabase, hotelId } = await authorizeOperationsWrite();
  const { data } = await supabase
    .from("audit_log")
    .select("action, actor_id, diff, created_at")
    .eq("hotel_id", hotelId)
    .eq("table_name", "daily_operations")
    .eq("record_id", rowId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

async function recomputeRooms(params: {
  supabase: Awaited<ReturnType<typeof requireSession>>["supabase"];
  hotelId: string;
  operationDate: string;
  roomIds: string[];
}) {
  const { supabase, hotelId, operationDate, roomIds } = params;

  // Only reservations that count (shared selector): a retired / moved-in-LH row never re-occupies a room.
  const { data: reservations } = await withActiveReservations((table) => supabase
    .from(table)
    .select("id, room_id, guest_name, arrival_date, departure_date, adults, children, babies, outstanding_balance, currency, booking_channel")
    .eq("hotel_id", hotelId)
    .in("room_id", roomIds)
    .lte("arrival_date", operationDate)
    .gte("departure_date", operationDate));

  const byRoom = new Map<string, ReservationForBoard[]>();
  for (const reservation of reservations ?? []) {
    const list = byRoom.get(reservation.room_id) ?? [];
    list.push({
      id: reservation.id,
      roomId: reservation.room_id,
      guestName: reservation.guest_name,
      arrivalDate: reservation.arrival_date,
      departureDate: reservation.departure_date,
      adults: reservation.adults,
      children: reservation.children,
      babies: reservation.babies,
      outstandingBalance: reservation.outstanding_balance,
      currency: reservation.currency
    });
    byRoom.set(reservation.room_id, list);
  }

  for (const roomId of roomIds) {
    const cell = materializeUnit(byRoom.get(roomId) ?? [], operationDate);
    await supabase.from("daily_operations").upsert(
      {
        hotel_id: hotelId,
        operation_date: operationDate,
        room_id: roomId,
        reservation_id: cell.reservationId,
        guest_name: cell.guestName,
        adults: cell.adults,
        children: cell.children,
        babies: cell.babies,
        total_pax: cell.adults + cell.children + cell.babies,
        arrival_date: cell.arrivalDate,
        departure_date: cell.departureDate,
        operational_status: cell.operationalStatus,
        housekeeping_category: cell.housekeepingCategory,
        same_day_arrival: cell.sameDayArrival,
        payment_status: cell.paymentStatus,
        outstanding_balance: cell.outstandingBalance,
        currency: cell.currency,
        booking_channel: reservations?.find((reservation) => reservation.id === cell.reservationId)?.booking_channel ?? null,
        manually_modified: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: "hotel_id,operation_date,room_id" }
    );
  }
}

/* ---------- "Repartir pax": per-room split of a booking over several rooms (migration 0033) ---------- */

export type SplitDialogData = {
  reference: string; arrivalDate: string; guest: string | null; state: SplitState;
  booking: Pax3; breakfast: boolean;
  rooms: { roomId: string; label: string; current: Pax3 | null }[];
};

/** The booking of `reservationId` with all its active rooms, for the split dialog. */
export async function loadReservationSplit(reservationId: string): Promise<{ ok: true; data: SplitDialogData } | { ok: false; error: string }> {
  try {
    const { supabase, hotelId } = await authorizeOperationsWrite();
    const id = z.string().uuid().parse(reservationId);
    const { data: own, error: ownError } = await supabase.from("reservations").select("reference, arrival_date").eq("id", id).eq("hotel_id", hotelId).single();
    if (ownError || !own) throw new Error(`RESERVATION_NOT_FOUND: ${ownError?.message ?? id}`);
    if (!own.reference?.trim()) throw new Error("NO_REFERENCE");
    const { data, error } = await withActiveReservations((table) => supabase.from(table)
      .select("id, reference, room_id, guest_name, arrival_date, adults, children, babies, notes, split_adults, split_children, split_babies, split_breakfast")
      .eq("hotel_id", hotelId).eq("reference", own.reference!).eq("arrival_date", own.arrival_date));
    if (isMissingSchema(error)) throw new Error("MIGRATION_0033_MISSING");
    if (error) throw new Error(`RESERVATIONS_LOAD_FAILED: ${error.message}`);
    const rows = data ?? [];
    if (rows.length < 2) throw new Error("NOT_MULTI_ROOM");
    const [{ data: rooms }, { data: board }] = await Promise.all([
      supabase.from("rooms").select("id, display_name, sort_order").eq("hotel_id", hotelId).in("id", rows.map((row) => row.room_id)),
      supabase.from("daily_operations").select("breakfast_status").eq("hotel_id", hotelId).in("reservation_id", rows.map((row) => row.id)).eq("breakfast_status", "included")
    ]);
    const roomById = new Map((rooms ?? []).map((room) => [room.id, room]));
    const splits = reservationSplits(splitSources(rows));
    const first = splits.get(rows[0].id)!;
    const sorted = [...rows].sort((a, b) => (roomById.get(a.room_id)?.sort_order ?? 0) - (roomById.get(b.room_id)?.sort_order ?? 0));
    // Breakfast for the booking: the one chosen in this dialog before, else any board row with it, else the LH notes.
    const breakfast = rows.find((row) => row.split_breakfast != null)?.split_breakfast
      ?? ((board ?? []).length > 0 || rows.some((row) => breakfastFromNotes(row.notes, row.adults, row.children).breakfast_status === "included"));
    return { ok: true, data: {
      reference: own.reference, arrivalDate: own.arrival_date, guest: rows[0].guest_name, state: first.state, booking: first.booking, breakfast,
      rooms: sorted.map((row) => ({
        roomId: row.room_id,
        label: roomById.get(row.room_id)?.display_name ?? row.room_id,
        current: row.split_adults != null && row.split_children != null && row.split_babies != null ? { adults: row.split_adults, children: row.split_children, babies: row.split_babies } : null
      }))
    } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const count = z.coerce.number().int().min(0).max(99);
const splitSchema = z.object({
  reference: z.string().trim().min(1).max(80),
  arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  breakfast: z.boolean(),
  rooms: z.array(z.object({ roomId: z.string().uuid(), adults: count, children: count, babies: count })).min(2).max(40)
});

/** Saves the whole split in one transaction (set_reservation_split): board rows and breakfast covers follow it. */
export async function saveReservationSplit(input: z.input<typeof splitSchema>): Promise<ActionResult> {
  return runAction("saveReservationSplit", async () => {
    const { supabase } = await authorizeOperationsWrite();
    const parsed = splitSchema.safeParse(input);
    if (!parsed.success) throw new Error("INVALID_INPUT");
    const { reference, arrivalDate, breakfast, rooms } = parsed.data;
    const { error } = await supabase.rpc("set_reservation_split", {
      p_reference: reference, p_arrival: arrivalDate, p_breakfast: breakfast,
      p_split: rooms.map((room) => ({ room_id: room.roomId, adults: room.adults, children: room.children, babies: room.babies }))
    });
    if (error) throw new Error(error.message);
    for (const path of ["/operations", "/dashboard", "/breakfast", "/breakfast/control", "/housekeeping"]) revalidatePath(path);
  });
}
