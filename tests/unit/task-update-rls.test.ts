// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs every migration, then performs the exact update updateTask() sends, as a
 * reception user with row-level security enforced (role "authenticated"), on a
 * task created by someone else. Proves the database side of "assign a task".
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const OTHER_HOTEL = "99999999-9999-4999-8999-999999999999";
const CREATOR = "22222222-2222-4222-8222-222222222222";
const RECEPTIONIST = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
let taskId: string;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update on all tables in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli'), ('${OTHER_HOTEL}', 'Other', 'other');
    insert into auth.users (id) values ('${CREATOR}'), ('${RECEPTIONIST}'), ('${OUTSIDER}');
    insert into public.profiles (id, hotel_id, full_name, role) values
      ('${CREATOR}', '${HOTEL}', 'Grettel', 'reception'),
      ('${RECEPTIONIST}', '${HOTEL}', 'Rebeca', 'reception'),
      ('${OUTSIDER}', '${OTHER_HOTEL}', 'Outsider', 'reception');
  `);
  taskId = (await db.query<{ id: string }>(
    `insert into public.tasks (hotel_id, operation_date, title, priority, status, created_by) values ($1, current_date, 'Fix AC', 'high', 'open', $2) returning id`,
    [HOTEL, CREATOR]
  )).rows[0].id;
}, 60_000);

afterAll(async () => { await db?.close(); });

async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('test.uid', '${userId}', false); set role authenticated;`);
  try { return await run(); } finally { await db.exec(`reset role;`); }
}

const updateTaskSql = (status: string, assignedTo: string | null, hotel = HOTEL) => db.query<{ id: string }>(
  `update public.tasks set status = $1, assigned_to = $2, updated_at = now() where id = $3 and hotel_id = $4 returning id`,
  [status, assignedTo, taskId, hotel]
);

describe("updateTask at the database level (RLS enforced)", () => {
  it("a receptionist can assign and change status on a task someone else created, and it persists", async () => {
    const result = await asUser(RECEPTIONIST, () => updateTaskSql("in_progress", "Marcos"));
    expect(result.rows).toHaveLength(1);
    const row = (await db.query<{ status: string; assigned_to: string; created_by: string }>(`select status, assigned_to, created_by from public.tasks where id = $1`, [taskId])).rows[0];
    expect(row).toEqual({ status: "in_progress", assigned_to: "Marcos", created_by: CREATOR });
  });

  it("clearing the assignee persists as null", async () => {
    await asUser(RECEPTIONIST, () => updateTaskSql("in_progress", null));
    expect((await db.query<{ assigned_to: string | null }>(`select assigned_to from public.tasks where id = $1`, [taskId])).rows[0].assigned_to).toBeNull();
  });

  it("a user from another hotel updates nothing (RLS), which the action reports as a failure", async () => {
    const result = await asUser(OUTSIDER, () => updateTaskSql("completed", "Hacker", HOTEL));
    expect(result.rows).toHaveLength(0);
  });
});
