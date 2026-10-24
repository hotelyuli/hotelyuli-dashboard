import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { isMissingSchema } from "@/lib/db/schema-errors";

/**
 * The ONE source for "which reservations count": public.active_reservations (migration 0032)
 * leaves out reservations a newer Little Hotelier file no longer lists – retired (cancelled /
 * missing) or flagged "moved in LH" – from the moment the import sees it, before anyone reviews it.
 * Every count reads through here: dashboard KPIs, Room board, breakfast, housekeeping, shift
 * report, imports. Before 0032 is applied the view doesn't exist and everything reads
 * public.reservations as before.
 */

type Client = SupabaseClient<Database>;

/**
 * Runs `build` on active_reservations, or on reservations if the view doesn't exist yet. The view
 * has exactly the reservations columns, so the same query works on both (hence the cast).
 */
export async function withActiveReservations<R extends { error: { code?: string | null } | null }>(build: (table: "reservations") => PromiseLike<R>): Promise<R> {
  const result = await build("active_reservations" as "reservations");
  return isMissingSchema(result.error) ? build("reservations") : result;
}

export type InactiveReason = "missing_from_import" | "cancelled" | "moved_in_lh" | "manual";
export type InactiveReservation = { guest: string | null; reason: InactiveReason; lhRoom: string | null };

/** Of the given reservation ids, those that don't count, with why. Empty before migration 0032. */
export async function inactiveReservations(supabase: Client, hotelId: string, reservationIds: (string | null)[]): Promise<Map<string, InactiveReservation>> {
  const ids = [...new Set(reservationIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("reservations")
    .select("id, guest_name, retired_reason, review_flag, review_flag_detail")
    .eq("hotel_id", hotelId).in("id", ids)
    .or("retired_at.not.is.null,review_flag.not.is.null");
  if (isMissingSchema(error)) return new Map();
  if (error) throw new Error(`RESERVATIONS_LOAD_FAILED: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id, { guest: row.guest_name, reason: (row.review_flag ?? row.retired_reason ?? "manual") as InactiveReason, lhRoom: row.review_flag_detail }]));
}

/** Badge on a board row whose stored reservation no longer counts. */
export function inactiveNote(info: InactiveReservation, es: boolean): string {
  const guest = info.guest ? ` (${info.guest})` : "";
  if (info.reason === "moved_in_lh") return es ? `Movida en Little Hotelier a ${info.lhRoom ?? "otra habitación"}${guest} – revisar` : `Moved in Little Hotelier to ${info.lhRoom ?? "another room"}${guest} – review`;
  if (info.reason === "cancelled") return es ? `Reserva cancelada${guest}` : `Booking cancelled${guest}`;
  return es ? `Reserva retirada: no está en Little Hotelier${guest}` : `Booking retired: not in Little Hotelier${guest}`;
}

type OperationRow = {
  id: string; reservation_id: string | null; guest_name: string | null; arrival_date?: string | null; departure_date?: string | null;
  adults?: number; children?: number; babies?: number; total_pax?: number; operational_status?: string; breakfast_status?: string;
  breakfast_pax?: number; breakfast_to_go?: boolean; payment_status?: string | null; outstanding_balance?: number | null;
};

/**
 * A board row (daily_operations) whose reservation no longer counts is shown as a free room:
 * no guest, no pax, no breakfast, no balance. Rows staff edited by hand are never wiped in the
 * database – they are only read this way. `notes` maps the row id to the reservation's state.
 */
export function clearInactiveOperations<T extends OperationRow>(rows: T[], inactive: ReadonlyMap<string, InactiveReservation>): { operations: T[]; notes: Map<string, InactiveReservation> } {
  const notes = new Map<string, InactiveReservation>();
  const operations = rows.map((row) => {
    const info = row.reservation_id ? inactive.get(row.reservation_id) : undefined;
    if (!info) return row;
    notes.set(row.id, info);
    return {
      ...row, reservation_id: null, guest_name: null, arrival_date: null, departure_date: null, adults: 0, children: 0, babies: 0, total_pax: 0,
      operational_status: "available", breakfast_status: "not_included", breakfast_pax: 0, breakfast_to_go: false, payment_status: null, outstanding_balance: null
    };
  });
  return { operations, notes };
}

export type RetirementReviewItem = {
  id: string; guest: string | null; reference: string | null; roomId: string; arrivalDate: string; departureDate: string;
  kind: "missing_from_import" | "moved_in_lh"; lhRoom: string | null;
};

/**
 * The review panel's list: reservations an import retired (missing from LH) or flagged (moved in LH)
 * that nobody reviewed yet, for stays not over before `fromDate`. Empty before migration 0032.
 */
export async function loadRetirementReview(supabase: Client, hotelId: string, fromDate: string): Promise<RetirementReviewItem[]> {
  const { data, error } = await supabase.from("reservations")
    .select("id, guest_name, reference, room_id, arrival_date, departure_date, retired_reason, review_flag, review_flag_detail")
    .eq("hotel_id", hotelId).is("reviewed_at", null).gte("departure_date", fromDate)
    .or("retired_reason.eq.missing_from_import,review_flag.eq.moved_in_lh")
    .order("arrival_date", { ascending: true });
  if (isMissingSchema(error)) return [];
  if (error) throw new Error(`RESERVATIONS_LOAD_FAILED: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id, guest: row.guest_name, reference: row.reference, roomId: row.room_id, arrivalDate: row.arrival_date, departureDate: row.departure_date,
    kind: row.review_flag === "moved_in_lh" ? "moved_in_lh" : "missing_from_import", lhRoom: row.review_flag_detail
  }));
}
