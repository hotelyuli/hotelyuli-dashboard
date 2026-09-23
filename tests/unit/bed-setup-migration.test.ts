// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BED_SETUPS } from "@/features/operations/logic/room-setup";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
let roomId: string;

const bedSetupChecks = async () => (await db.query<{ conname: string; def: string }>(
  `select conname, pg_get_constraintdef(oid) as def from pg_constraint
   where conrelid = 'public.daily_operations'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%bed_setup%'`
)).rows;

const setBedSetup = (value: string | null) => db.query(
  `insert into public.daily_operations (hotel_id, operation_date, room_id, operational_status, bed_setup)
   values ($1, current_date, $2, 'available', $3)
   on conflict (hotel_id, operation_date, room_id) do update set bed_setup = excluded.bed_setup`,
  [HOTEL, roomId, value]
);

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name < "0022").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli'); select public.seed_default_rooms('${HOTEL}');`);
  roomId = (await db.query<{ id: string }>(`select id from public.rooms where unit_code = '10'`)).rows[0].id;
}, 60_000);

afterAll(async () => { await db?.close(); });

describe("migration 0022: bed setup options", () => {
  it("0018 created the check under the name 0022 drops, and it rejects the new values", async () => {
    expect((await bedSetupChecks()).map((c) => c.conname)).toEqual(["daily_operations_bed_setup_check"]);
    await expect(setBedSetup("three_twin")).rejects.toThrow(/daily_operations_bed_setup_check/);
  });

  it("replaces the constraint (no duplicate) and accepts every app option plus null", async () => {
    const migration = fs.readFileSync(path.join(MIGRATIONS_DIR, "0022_bed_setup_options.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration); // re-run is safe
    expect((await bedSetupChecks()).map((c) => c.conname)).toEqual(["daily_operations_bed_setup_check"]);
    for (const value of [...BED_SETUPS, null]) await setBedSetup(value);
    await expect(setBedSetup("queen")).rejects.toThrow(/daily_operations_bed_setup_check/);
  });
});
