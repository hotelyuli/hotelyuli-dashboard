// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Runs the real migrations (0001-0020) in an in-process Postgres (PGlite) and
 * exercises the incident -> task trigger from 0020. Supabase's auth schema is
 * stubbed: auth.uid() reads a session setting so tests can act as a user.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const OTHER_RECEPTIONIST = "33333333-3333-4333-8333-333333333333";

let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  `);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli');
    insert into auth.users (id) values ('${AUTHOR}'), ('${OTHER_RECEPTIONIST}');
    insert into public.profiles (id, hotel_id, full_name, role) values
      ('${AUTHOR}', '${HOTEL}', 'Grettel', 'reception'),
      ('${OTHER_RECEPTIONIST}', '${HOTEL}', 'Rebeca', 'reception');
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`select set_config('test.uid', '${AUTHOR}', false); delete from public.tasks; delete from public.shift_events;`);
});

async function actAs(userId: string) {
  await db.query(`select set_config('test.uid', $1, false)`, [userId]);
}

async function insertEvent(status: string, options: { id?: string; requiresFollowUp?: boolean } = {}) {
  const result = await db.query<{ id: string }>(
    `insert into public.shift_events (id, hotel_id, operation_date, event_time, category, room_area, description, status, priority, requires_follow_up, created_by)
     values (coalesce($1::uuid, gen_random_uuid()), $2, current_date, '10:00', 'maintenance', 'Hab 5', 'AC leaking', $3, 'high', $4, $5)
     on conflict (id) do nothing
     returning id`,
    [options.id ?? null, HOTEL, status, options.requiresFollowUp ?? false, AUTHOR]
  );
  return result.rows[0]?.id;
}

async function setEventStatus(id: string, status: string) {
  await db.query(`update public.shift_events set status = $1, updated_at = now() where id = $2`, [status, id]);
}

async function tasksFor(eventId: string) {
  return (await db.query<{ id: string; status: string; title: string; created_by: string }>(
    `select id, status, title, created_by from public.tasks where source_event_id = $1`, [eventId]
  )).rows;
}

async function eventStatus(id: string) {
  return (await db.query<{ status: string }>(`select status from public.shift_events where id = $1`, [id])).rows[0].status;
}

describe("incident -> task trigger (migration 0020)", () => {
  it("an incident that is not completed creates exactly one open task", async () => {
    const id = await insertEvent("follow_up");
    const tasks = await tasksFor(id!);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ status: "open", title: "AC leaking" });
  });

  it("a completed incident never creates a task, even with follow-up flagged (0021 rule)", async () => {
    expect(await tasksFor((await insertEvent("completed"))!)).toHaveLength(0);
    expect(await tasksFor((await insertEvent("completed", { requiresFollowUp: true }))!)).toHaveLength(0);
  });

  it.each(["open", "follow_up", "temporary_solution"])("a %s incident creates one open task", async (status) => {
    const tasks = await tasksFor((await insertEvent(status))!);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("open");
  });

  it("re-saving the same incident (retry with the same id) never duplicates incident or task", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    await insertEvent("open", { id });
    await insertEvent("open", { id });
    await setEventStatus(id, "follow_up");
    await setEventStatus(id, "temporary_solution");
    expect((await db.query(`select 1 from public.shift_events where id = $1`, [id])).rows).toHaveLength(1);
    expect(await tasksFor(id)).toHaveLength(1);
  });

  it("the database refuses a second task linked to the same incident", async () => {
    const id = await insertEvent("open");
    await expect(db.query(
      `insert into public.tasks (hotel_id, operation_date, source_event_id, title, priority, created_by) values ($1, current_date, $2, 'dup', 'low', $3)`,
      [HOTEL, id, AUTHOR]
    )).rejects.toThrow(/tasks_one_per_event/);
  });

  it("completing the incident closes its linked task, even when another receptionist does it", async () => {
    const id = await insertEvent("follow_up");
    await actAs(OTHER_RECEPTIONIST);
    await setEventStatus(id!, "completed");
    const [task] = await tasksFor(id!);
    expect(task.status).toBe("completed");
    expect(task.created_by).toBe(AUTHOR);
  });

  it("completing the task does not change the incident", async () => {
    const id = await insertEvent("follow_up");
    await db.query(`update public.tasks set status = 'completed' where source_event_id = $1`, [id]);
    expect(await eventStatus(id!)).toBe("follow_up");
  });

  it("editing an incident without changing its status never reopens a task finished by hand", async () => {
    const id = await insertEvent("follow_up");
    await db.query(`update public.tasks set status = 'completed' where source_event_id = $1`, [id]);
    await db.query(`update public.shift_events set action_taken = 'Technician called' where id = $1`, [id]);
    expect((await tasksFor(id!))[0].status).toBe("completed");
  });

  it("reopening a completed incident reopens its task", async () => {
    const id = await insertEvent("follow_up");
    await setEventStatus(id!, "completed");
    await setEventStatus(id!, "follow_up");
    const tasks = await tasksFor(id!);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("open");
  });

  it("reopening an incident that never had a task creates one", async () => {
    const id = await insertEvent("completed");
    expect(await tasksFor(id!)).toHaveLength(0);
    await setEventStatus(id!, "open");
    const tasks = await tasksFor(id!);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("open");
  });

  it("0021 repairs a live DB without the trigger: backfills missing tasks, closes tasks of completed incidents, re-run is safe", async () => {
    const repair = fs.readFileSync(path.join(MIGRATIONS_DIR, "0021_incident_task_repair.sql"), "utf8");
    // Simulate the broken live state: trigger missing, incidents saved without tasks.
    await db.exec(`drop trigger shift_events_sync_task on public.shift_events;`);
    const followUp = await insertEvent("follow_up");
    const open = await insertEvent("open");
    const done = await insertEvent("completed");
    await db.query(
      `insert into public.tasks (hotel_id, operation_date, source_event_id, title, priority, status, created_by) values ($1, current_date, $2, 'wrongly open', 'low', 'open', $3)`,
      [HOTEL, done, AUTHOR]
    );
    expect(await tasksFor(followUp!)).toHaveLength(0);

    await db.exec(repair);
    expect((await tasksFor(followUp!)).map((t) => t.status)).toEqual(["open"]);
    expect((await tasksFor(open!)).map((t) => t.status)).toEqual(["open"]);
    expect((await tasksFor(done!)).map((t) => t.status)).toEqual(["completed"]);

    await db.exec(repair);
    expect(await tasksFor(followUp!)).toHaveLength(1);
    // The trigger is back: a new follow-up incident gets its task immediately.
    expect(await tasksFor((await insertEvent("follow_up"))!)).toHaveLength(1);
  });

  it("an incident keeps its author and hotel when someone else edits it", async () => {
    const id = await insertEvent("open");
    await actAs(OTHER_RECEPTIONIST);
    await db.query(`update public.shift_events set created_by = $1, status = 'completed' where id = $2`, [OTHER_RECEPTIONIST, id]);
    const row = (await db.query<{ created_by: string }>(`select created_by from public.shift_events where id = $1`, [id])).rows[0];
    expect(row.created_by).toBe(AUTHOR);
  });
});
