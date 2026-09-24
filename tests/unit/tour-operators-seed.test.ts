// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Migration 0028 against real Postgres: seeds the 6 tour operators into the Supplier directory. */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const SEED = fs.readFileSync(path.join(MIGRATIONS_DIR, "0028_seed_tour_operators.sql"), "utf8");
let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name < "0028").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli');
    insert into public.supplier_contacts (hotel_id, name, category, phone, operator_name) values ('${HOTEL}', 'Old Dolphin', 'tour', '50611111111', ' dolphin tours ');`);
  await db.exec(SEED);
}, 60_000);

afterAll(async () => { await db?.close(); });

const tourContacts = async () => (await db.query<{ name: string; phone: string; operator_name: string }>(
  `select name, phone, operator_name from public.supplier_contacts where hotel_id = '${HOTEL}' and category = 'tour' order by name`
)).rows;

describe("0028 tour operator seed", () => {
  it("adds the 6 operators as tour contacts with their phones", async () => {
    const rows = await tourContacts();
    expect(rows.map((row) => row.name)).toEqual(["Ballena Tour", "Costa Rica Dive and Surf", "Dolphin Tours", "Jimena Professional Surf Lesson", "Osa Canopy Tour", "Ronald Tour De Chocolate Playa Hermosa"]);
    expect(rows.find((row) => row.name === "Osa Canopy Tour")).toMatchObject({ phone: "50688841237", operator_name: "Osa Canopy Tour" });
  });

  it("updates an existing operator instead of duplicating it, and is safe to run twice", async () => {
    await db.exec(SEED);
    const rows = await tourContacts();
    expect(rows).toHaveLength(6);
    expect(rows.find((row) => row.name === "Dolphin Tours")).toMatchObject({ phone: "50688543022", operator_name: "Dolphin Tours" });
  });
});
