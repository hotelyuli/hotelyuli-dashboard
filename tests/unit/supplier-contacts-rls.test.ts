// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Migration 0026 against real Postgres with RLS on: edit + delete of supplier contacts, hotel-scoped. */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const OTHER_HOTEL = "99999999-9999-4999-8999-999999999999";
const RECEPTIONIST = "33333333-3333-4333-8333-333333333333";
const HOUSEKEEPER = "55555555-5555-4555-8555-555555555555";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name < "0026").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli'), ('${OTHER_HOTEL}', 'Other', 'other');
    insert into auth.users (id) values ('${RECEPTIONIST}'), ('${HOUSEKEEPER}'), ('${OUTSIDER}');
    insert into public.profiles (id, hotel_id, full_name, role) values
      ('${RECEPTIONIST}', '${HOTEL}', 'Rebeca', 'reception'), ('${HOUSEKEEPER}', '${HOTEL}', 'Marcos', 'housekeeping'), ('${OUTSIDER}', '${OTHER_HOTEL}', 'Outsider', 'reception');
  `);
}, 60_000);

afterAll(async () => { await db?.close(); });

async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('test.uid', '${userId}', false); set role authenticated;`);
  try { return await run(); } finally { await db.exec(`reset role;`); }
}
const addContact = async (name: string) => (await db.query<{ id: string }>(
  `insert into public.supplier_contacts (hotel_id, name, category, phone, created_by) values ($1, $2, 'pool', '50688887777', $3) returning id`, [HOTEL, name, RECEPTIONIST]
)).rows[0].id;
const deleteContact = (id: string) => db.query<{ id: string }>(`delete from public.supplier_contacts where id = $1 and hotel_id = $2 returning id`, [id, HOTEL]);

describe("migration 0026: supplier contacts edit + delete", () => {
  it("before 0026 nobody can delete a contact (no delete policy)", async () => {
    const id = await addContact("Piscinas Uvita");
    expect((await asUser(RECEPTIONIST, () => deleteContact(id))).rows).toHaveLength(0);
  });

  it("after 0026 reception can edit and delete contacts of their hotel; deletes are audited", async () => {
    const migration = fs.readFileSync(path.join(MIGRATIONS_DIR, "0026_supplier_contacts_edit_delete.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration); // re-run is safe
    const id = await addContact("Aire Frío CR");
    const edited = await asUser(RECEPTIONIST, () => db.query(`update public.supplier_contacts set name = 'Aire Frío Costa Rica', phone = '50611112222' where id = $1 and hotel_id = $2 returning id`, [id, HOTEL]));
    expect(edited.rows).toHaveLength(1);
    expect((await asUser(RECEPTIONIST, () => deleteContact(id))).rows).toEqual([{ id }]);
    const audit = (await db.query<{ action: string }>(`select action from public.audit_log where table_name = 'supplier_contacts' and record_id = $1 order by created_at`, [id])).rows.map((row) => row.action);
    expect(audit).toContain("delete");
  });

  it("a user from another hotel or a non-reception role cannot delete", async () => {
    const id = await addContact("Mantenimiento Sur");
    expect((await asUser(OUTSIDER, () => deleteContact(id))).rows).toHaveLength(0);
    expect((await asUser(HOUSEKEEPER, () => deleteContact(id))).rows).toHaveLength(0);
    expect((await db.query(`select 1 from public.supplier_contacts where id = $1`, [id])).rows).toHaveLength(1);
  });
});
