// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Reproduces the live /tasks bug: 0014/0020's task policies never applied, so the
 * only write policy is 0012's tasks_write (ALL, check created_by = auth.uid()).
 * The inline Save (updateTask) updates tasks directly and is rejected for tasks
 * created by someone else - while the incident dialog works because the sync
 * trigger is SECURITY DEFINER. Then applies 0025 and runs updateTask's exact
 * status-only update with RLS enforced.
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
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name < "0025").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli'), ('${OTHER_HOTEL}', 'Other', 'other');
    insert into auth.users (id) values ('${CREATOR}'), ('${RECEPTIONIST}'), ('${OUTSIDER}');
    insert into public.profiles (id, hotel_id, full_name, role) values
      ('${CREATOR}', '${HOTEL}', 'Grettel', 'reception'), ('${RECEPTIONIST}', '${HOTEL}', 'Rebeca', 'reception'), ('${OUTSIDER}', '${OTHER_HOTEL}', 'Outsider', 'reception');
    -- Recreate the live state: only 0012's policies on tasks.
    drop policy if exists tasks_insert on public.tasks;
    drop policy if exists tasks_update on public.tasks;
    create policy tasks_write on public.tasks for all to authenticated
      using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'))
      with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
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

// The exact statement updateTask() sends (status only, returning the saved status).
const updateTaskSql = (status: string, hotel = HOTEL) => db.query<{ id: string; status: string }>(
  `update public.tasks set status = $1, updated_at = now() where id = $2 and hotel_id = $3 returning id, status`,
  [status, taskId, hotel]
);
const savedStatus = async () => (await db.query<{ status: string }>(`select status from public.tasks where id = $1`, [taskId])).rows[0].status;

describe("inline task Save vs RLS (migration 0025)", () => {
  it("reproduces the live bug: another receptionist's inline status save is rejected and nothing persists", async () => {
    await expect(asUser(RECEPTIONIST, () => updateTaskSql("in_progress"))).rejects.toThrow(/row-level security policy for table "tasks"/);
    expect(await savedStatus()).toBe("open");
  });

  it("after 0025 the inline status save persists for any reception user; the author is kept", async () => {
    const migration = fs.readFileSync(path.join(MIGRATIONS_DIR, "0025_tasks_policies.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration); // re-run is safe
    const result = await asUser(RECEPTIONIST, () => updateTaskSql("in_progress"));
    expect(result.rows).toEqual([{ id: taskId, status: "in_progress" }]);
    expect(await savedStatus()).toBe("in_progress");
    expect((await db.query<{ created_by: string }>(`select created_by from public.tasks where id = $1`, [taskId])).rows[0].created_by).toBe(CREATOR);
  });

  it("leaves select + insert + update only (no deletes) and tasks stay readable", async () => {
    const policies = (await db.query<{ policyname: string; cmd: string }>(`select policyname, cmd from pg_policies where tablename = 'tasks' order by policyname`)).rows;
    expect(policies).toEqual([
      { policyname: "tasks_insert", cmd: "INSERT" },
      { policyname: "tasks_select", cmd: "SELECT" },
      { policyname: "tasks_update", cmd: "UPDATE" }
    ]);
    expect((await asUser(RECEPTIONIST, () => db.query(`select id from public.tasks where id = $1`, [taskId]))).rows).toHaveLength(1);
    expect((await asUser(RECEPTIONIST, () => db.query(`delete from public.tasks where id = $1 returning id`, [taskId]))).rows).toHaveLength(0);
  });

  it("a user from another hotel updates nothing", async () => {
    expect((await asUser(OUTSIDER, () => updateTaskSql("completed", HOTEL))).rows).toHaveLength(0);
    expect(await savedStatus()).toBe("in_progress");
  });
});
