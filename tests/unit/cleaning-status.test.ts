// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLEANING_STATUSES, cleaningStatusLabel, nextCleaningStatus } from "@/features/operations/logic/cleaning";

describe("cleaning status steps", () => {
  it("advances pending -> ready_for_inspection -> clean, one step at a time", () => {
    expect(nextCleaningStatus("pending", "mark_ready")).toBe("ready_for_inspection");
    expect(nextCleaningStatus("ready_for_inspection", "pass_inspection")).toBe("clean");
  });
  it("refuses a step from the wrong state (no skipping, no repeats)", () => {
    expect(nextCleaningStatus("pending", "pass_inspection")).toBeNull();
    expect(nextCleaningStatus("ready_for_inspection", "mark_ready")).toBeNull();
    expect(nextCleaningStatus("clean", "mark_ready")).toBeNull();
    expect(nextCleaningStatus("clean", "pass_inspection")).toBeNull();
  });
  it("labels the tags in Spanish and English", () => {
    expect(CLEANING_STATUSES.map((status) => cleaningStatusLabel(status, "es"))).toEqual(["En limpieza", "Inspección", "Lista"]);
    expect(CLEANING_STATUSES.map((status) => cleaningStatusLabel(status, "en"))).toEqual(["Cleaning", "Inspection", "Clean"]);
  });
});

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
let roomId: string;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name < "0023").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli'); select public.seed_default_rooms('${HOTEL}');`);
  roomId = (await db.query<{ id: string }>(`select id from public.rooms where unit_code = '5'`)).rows[0].id;
  // A board row that exists before the migration runs.
  await db.query(`insert into public.daily_operations (hotel_id, operation_date, room_id, operational_status) values ($1, current_date, $2, 'available')`, [HOTEL, roomId]);
}, 60_000);

afterAll(async () => { await db?.close(); });

const statusOfRoom = async () => (await db.query<{ cleaning_status: string }>(`select cleaning_status from public.daily_operations where room_id = $1`, [roomId])).rows[0].cleaning_status;

describe("migration 0023: cleaning_status", () => {
  it("adds the column with existing rows set to pending, and is safe to re-run", async () => {
    const migration = fs.readFileSync(path.join(MIGRATIONS_DIR, "0023_cleaning_status.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    expect(await statusOfRoom()).toBe("pending");
  });

  it("accepts the three statuses and rejects anything else", async () => {
    for (const status of CLEANING_STATUSES) await db.query(`update public.daily_operations set cleaning_status = $1 where room_id = $2`, [status, roomId]);
    await expect(db.query(`update public.daily_operations set cleaning_status = 'dirty' where room_id = $1`, [roomId])).rejects.toThrow(/daily_operations_cleaning_status_check/);
  });

  it("a board re-materialization (upsert without cleaning_status) keeps the room's status", async () => {
    await db.query(`update public.daily_operations set cleaning_status = 'ready_for_inspection' where room_id = $1`, [roomId]);
    await db.query(
      `insert into public.daily_operations (hotel_id, operation_date, room_id, operational_status, guest_name) values ($1, current_date, $2, 'staying', 'Ana')
       on conflict (hotel_id, operation_date, room_id) do update set operational_status = excluded.operational_status, guest_name = excluded.guest_name`,
      [HOTEL, roomId]
    );
    expect(await statusOfRoom()).toBe("ready_for_inspection");
  });
});
