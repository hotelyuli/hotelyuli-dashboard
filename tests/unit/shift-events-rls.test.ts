// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Reproduces the live failure (0020's shift_events policies never applied: only
 * the old 0012 "for all" policy that requires created_by = auth.uid()), then
 * applies 0024 and checks editing any incident of the hotel works, with RLS on.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const OTHER_HOTEL = "99999999-9999-4999-8999-999999999999";
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const RECEPTIONIST = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
let eventId: string;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name < "0024").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli'), ('${OTHER_HOTEL}', 'Other', 'other');
    insert into auth.users (id) values ('${AUTHOR}'), ('${RECEPTIONIST}'), ('${OUTSIDER}');
    insert into public.profiles (id, hotel_id, full_name, role) values
      ('${AUTHOR}', '${HOTEL}', 'Grettel', 'reception'), ('${RECEPTIONIST}', '${HOTEL}', 'Rebeca', 'reception'), ('${OUTSIDER}', '${OTHER_HOTEL}', 'Outsider', 'reception');
    -- Recreate the live state: 0020's policies missing, the 0012 author-only policy present.
    drop policy if exists shift_events_insert on public.shift_events;
    drop policy if exists shift_events_update on public.shift_events;
    create policy shift_events_write on public.shift_events for all to authenticated
      using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'))
      with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
  `);
  eventId = (await db.query<{ id: string }>(
    `insert into public.shift_events (hotel_id, operation_date, event_time, category, description, status, priority, created_by)
     values ($1, current_date, '10:00', 'maintenance', 'AC leaking', 'follow_up', 'high', $2) returning id`, [HOTEL, AUTHOR]
  )).rows[0].id;
}, 60_000);

afterAll(async () => { await db?.close(); });

async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('test.uid', '${userId}', false); set role authenticated;`);
  try { return await run(); } finally { await db.exec(`reset role;`); }
}
const editEvent = (status: string) => db.query<{ id: string }>(
  `update public.shift_events set status = $1, action_taken = 'Technician called', updated_at = now() where id = $2 and hotel_id = $3 returning id`,
  [status, eventId, HOTEL]
);

describe("migration 0024: shift_events policies", () => {
  it("reproduces the live error before 0024: another receptionist cannot edit the incident", async () => {
    await expect(asUser(RECEPTIONIST, () => editEvent("temporary_solution"))).rejects.toThrow(/row-level security policy for table "shift_events"/);
  });

  it("after 0024 any owner/manager/reception user of the hotel can edit it; author is kept", async () => {
    const migration = fs.readFileSync(path.join(MIGRATIONS_DIR, "0024_shift_events_policies.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration); // re-run is safe
    const result = await asUser(RECEPTIONIST, () => editEvent("completed"));
    expect(result.rows).toHaveLength(1);
    const row = (await db.query<{ status: string; created_by: string }>(`select status, created_by from public.shift_events where id = $1`, [eventId])).rows[0];
    expect(row).toEqual({ status: "completed", created_by: AUTHOR });
  });

  it("leaves exactly select + insert + update policies, so nobody can delete incidents", async () => {
    const policies = (await db.query<{ policyname: string; cmd: string }>(`select policyname, cmd from pg_policies where tablename = 'shift_events' order by policyname`)).rows;
    expect(policies).toEqual([
      { policyname: "shift_events_insert", cmd: "INSERT" },
      { policyname: "shift_events_select", cmd: "SELECT" },
      { policyname: "shift_events_update", cmd: "UPDATE" }
    ]);
    const deleted = await asUser(RECEPTIONIST, () => db.query(`delete from public.shift_events where id = $1 returning id`, [eventId]));
    expect(deleted.rows).toHaveLength(0);
  });

  it("a user from another hotel still cannot edit it", async () => {
    const result = await asUser(OUTSIDER, () => editEvent("open"));
    expect(result.rows).toHaveLength(0);
  });
});
