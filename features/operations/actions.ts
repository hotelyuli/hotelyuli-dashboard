"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/features/auth/logic/guards";
import { can } from "@/features/auth/logic/permissions";
import type { AppRole } from "@/features/auth/logic/permissions";
import { materializeUnit, type ReservationForBoard } from "@/features/operations/logic/board";
import { BED_SETUPS, HOUSEKEEPERS, supportsBedSetup, type BedSetup } from "@/features/operations/logic/room-setup";

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
  breakfastToGoTime: z.string().regex(/^(\d{2}:\d{2})?$/)
});

export async function updateOperationCell(formData: FormData) {
  const { supabase, hotelId } = await authorizeOperationsWrite();
  const parsed = updateCellSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const data = parsed.data;
  const outstandingBalance = data.outstandingBalance === "" ? null : Number.parseFloat(data.outstandingBalance);

  // Bed setup only applies to the convertible rooms; anything else is stored as null.
  let bedSetup: BedSetup | null = null;
  if (data.bedSetup) {
    const { data: cell } = await supabase.from("daily_operations").select("room_id").eq("id", data.rowId).eq("hotel_id", hotelId).single();
    const { data: room } = cell ? await supabase.from("rooms").select("unit_code").eq("id", cell.room_id).eq("hotel_id", hotelId).single() : { data: null };
    if (supportsBedSetup(room?.unit_code)) bedSetup = data.bedSetup;
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
  if (error || !updated) throw new Error("SAVE_FAILED");

  revalidatePath("/operations");
  revalidatePath("/dashboard");
  revalidatePath("/breakfast");
  revalidatePath("/housekeeping");
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

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, room_id, guest_name, arrival_date, departure_date, adults, children, babies, outstanding_balance, currency, booking_channel")
    .eq("hotel_id", hotelId)
    .in("room_id", roomIds)
    .lte("arrival_date", operationDate)
    .gte("departure_date", operationDate);

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
