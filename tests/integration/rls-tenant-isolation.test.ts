import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/database.types";

/**
 * Cross-tenant RLS isolation test (handoff §2.5 / §3.8).
 *
 * Requires a running local Supabase stack with the migrations in
 * supabase/migrations applied (`supabase start` then `supabase db reset`).
 * Point these at it before running `npm run test`:
 *
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321
 *   SUPABASE_TEST_ANON_KEY=<anon key from `supabase status`>
 *   SUPABASE_TEST_SERVICE_ROLE_KEY=<service role key from `supabase status`>
 *
 * The suite skips itself (not a failure) when these are absent, since no
 * local Postgres/Supabase instance is available in every environment.
 */

const TEST_URL = process.env.SUPABASE_TEST_URL;
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const canRun = Boolean(TEST_URL && ANON_KEY && SERVICE_ROLE_KEY);

describe.skipIf(!canRun)("RLS tenant isolation", () => {
  const password = `Test-${randomUUID()}!`;
  let admin: SupabaseClient<Database>;
  let hotelA: { id: string };
  let hotelB: { id: string };
  let userAEmail: string;
  let userAId: string;
  let userBId: string;
  let roomB: { id: string };
  let clientA: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createClient<Database>(TEST_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const suffix = randomUUID().slice(0, 8);
    const { data: insertedHotels, error: hotelsError } = await admin
      .from("hotels")
      .insert([
        { name: `RLS Test Hotel A ${suffix}`, slug: `rls-test-a-${suffix}` },
        { name: `RLS Test Hotel B ${suffix}`, slug: `rls-test-b-${suffix}` }
      ])
      .select("id");
    if (hotelsError || !insertedHotels) throw hotelsError ?? new Error("hotel setup failed");
    [hotelA, hotelB] = insertedHotels;

    userAEmail = `rls-a-${suffix}@example.com`;
    const userBEmail = `rls-b-${suffix}@example.com`;

    const { data: userA, error: userAError } = await admin.auth.admin.createUser({
      email: userAEmail,
      password,
      email_confirm: true
    });
    if (userAError || !userA.user) throw userAError ?? new Error("user A creation failed");
    userAId = userA.user.id;

    const { data: userB, error: userBError } = await admin.auth.admin.createUser({
      email: userBEmail,
      password,
      email_confirm: true
    });
    if (userBError || !userB.user) throw userBError ?? new Error("user B creation failed");
    userBId = userB.user.id;

    const { error: profilesError } = await admin.from("profiles").insert([
      { id: userA.user.id, hotel_id: hotelA.id, full_name: "RLS Test Owner A", role: "owner" },
      { id: userB.user.id, hotel_id: hotelB.id, full_name: "RLS Test Owner B", role: "owner" }
    ]);
    if (profilesError) throw profilesError;

    const { error: staffError } = await admin.from("daily_staff_assignments").insert({
      hotel_id: hotelB.id,
      operation_date: "2026-01-01",
      morning_receptionist: "Hotel B Morning",
      afternoon_receptionist: "Hotel B Afternoon",
      security_guard: "Hotel B Security",
      updated_by: userB.user.id
    });
    if (staffError) throw staffError;

    const { error: importError } = await admin.from("reservation_imports").insert({
      hotel_id: hotelB.id,
      operation_date: "2026-01-01",
      file_type: "check_in",
      file_name: "hotel-b.csv",
      content_hash: "b".repeat(64),
      row_count: 0,
      headers: ["Guest"],
      rows: [],
      imported_by: userB.user.id
    });
    if (importError) throw importError;

    const { data: insertedRoomB, error: roomError } = await admin
      .from("rooms")
      .insert({ hotel_id: hotelB.id, unit_code: `1-${suffix}`, display_name: "Habitación 1", room_number: "1", unit_type: "room", sort_order: 1 })
      .select("id")
      .single();
    if (roomError || !insertedRoomB) throw roomError ?? new Error("room setup failed");
    roomB = insertedRoomB;

    const { data: reservationB, error: reservationError } = await admin
      .from("reservations")
      .insert({ hotel_id: hotelB.id, room_id: roomB.id, guest_name: "Hotel B Guest", arrival_date: "2026-01-01", departure_date: "2026-01-02" })
      .select("id")
      .single();
    if (reservationError || !reservationB) throw reservationError ?? new Error("reservation setup failed");

    const { error: dailyOpsError } = await admin.from("daily_operations").insert({
      hotel_id: hotelB.id,
      operation_date: "2026-01-01",
      room_id: roomB.id,
      reservation_id: reservationB.id,
      guest_name: "Hotel B Guest",
      operational_status: "staying"
    });
    if (dailyOpsError) throw dailyOpsError;

    clientA = createClient<Database>(TEST_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error: signInError } = await clientA.auth.signInWithPassword({
      email: userAEmail,
      password
    });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    if (!admin) return;
    const hotelIds = [hotelA.id, hotelB.id];
    // Respect on-delete-restrict FKs: children before parents, profiles before auth users.
    await admin.from("daily_operations").delete().in("hotel_id", hotelIds);
    await admin.from("reservations").delete().in("hotel_id", hotelIds);
    await admin.from("rooms").delete().in("hotel_id", hotelIds);
    await admin.from("reservation_imports").delete().in("hotel_id", hotelIds);
    await admin.from("daily_staff_assignments").delete().in("hotel_id", hotelIds);
    await admin.from("profiles").delete().in("id", [userAId, userBId]);
    await admin.auth.admin.deleteUser(userBId).catch(() => {});
    if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => {});
    await admin.from("hotels").delete().in("id", hotelIds);
  });

  it("returns zero rows from another hotel across every tenant-scoped table", async () => {
    const hotels = await clientA.from("hotels").select("id").eq("id", hotelB.id);
    expect(hotels.data).toEqual([]);

    const profiles = await clientA.from("profiles").select("id").eq("hotel_id", hotelB.id);
    expect(profiles.data).toEqual([]);

    const staff = await clientA
      .from("daily_staff_assignments")
      .select("hotel_id")
      .eq("hotel_id", hotelB.id);
    expect(staff.data).toEqual([]);

    const imports = await clientA
      .from("reservation_imports")
      .select("hotel_id")
      .eq("hotel_id", hotelB.id);
    expect(imports.data).toEqual([]);

    const rooms = await clientA.from("rooms").select("id").eq("hotel_id", hotelB.id);
    expect(rooms.data).toEqual([]);

    const reservations = await clientA.from("reservations").select("id").eq("hotel_id", hotelB.id);
    expect(reservations.data).toEqual([]);

    const dailyOperations = await clientA.from("daily_operations").select("id").eq("hotel_id", hotelB.id);
    expect(dailyOperations.data).toEqual([]);

    const auditLog = await clientA.from("audit_log").select("id").eq("hotel_id", hotelB.id);
    expect(auditLog.data).toEqual([]);
  });

  it("rejects inserts and updates targeting another hotel", async () => {
    const insert = await clientA.from("daily_staff_assignments").insert({
      hotel_id: hotelB.id,
      operation_date: "2026-01-02",
      morning_receptionist: "Intruder",
      afternoon_receptionist: "Intruder",
      security_guard: "Intruder",
      updated_by: userBId
    });
    expect(insert.error).not.toBeNull();

    const update = await clientA
      .from("daily_staff_assignments")
      .update({ morning_receptionist: "Hacked" })
      .eq("hotel_id", hotelB.id);
    const recheck = await admin
      .from("daily_staff_assignments")
      .select("morning_receptionist")
      .eq("hotel_id", hotelB.id)
      .single();
    expect(update.error !== null || recheck.data?.morning_receptionist !== "Hacked").toBe(true);
  });

  it("rejects writes to daily_operations and reservations in another hotel", async () => {
    const reservationInsert = await clientA.from("reservations").insert({
      hotel_id: hotelB.id,
      room_id: roomB.id,
      guest_name: "Intruder",
      arrival_date: "2026-01-05",
      departure_date: "2026-01-06"
    });
    expect(reservationInsert.error).not.toBeNull();

    const dailyOperationsUpdate = await clientA
      .from("daily_operations")
      .update({ guest_name: "Hacked" })
      .eq("hotel_id", hotelB.id)
      .eq("room_id", roomB.id);
    const recheck = await admin
      .from("daily_operations")
      .select("guest_name")
      .eq("hotel_id", hotelB.id)
      .eq("room_id", roomB.id)
      .single();
    expect(dailyOperationsUpdate.error !== null || recheck.data?.guest_name !== "Hacked").toBe(true);
  });
});
