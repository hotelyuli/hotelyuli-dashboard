// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migrations 0029 + 0030 against real Postgres with RLS on: edits re-queue the sheet;
 * tours are never hard-deleted; only a cancelled tour can be hidden, and hiding keeps
 * the row, its income link and its sheet row.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const RECEPTIONIST = "33333333-3333-4333-8333-333333333333";
const MANAGER = "66666666-6666-4666-8666-666666666666";
let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name <= "0030_tour_hidden.sql").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  // Both are safe to re-run.
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "0029_tour_edit_delete.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "0030_tour_hidden.sql"), "utf8"));
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli');
    insert into auth.users (id) values ('${RECEPTIONIST}'), ('${MANAGER}');
    insert into public.profiles (id, hotel_id, full_name, role) values ('${RECEPTIONIST}', '${HOTEL}', 'Rebeca', 'reception'), ('${MANAGER}', '${HOTEL}', 'Yuli', 'manager');
  `);
}, 60_000);

afterAll(async () => { await db?.close(); });

async function addTour(status = "pending", outbox = "sent") {
  const id = (await db.query<{ id: string }>(
    `insert into public.tour_bookings (hotel_id, operation_date, guest_name, operator_name, tour_name, tour_date, total_price, currency, commission_amount, status, booked_by, created_by)
     values ($1, current_date, 'Ana', 'Ballena Tour', 'Whale Watching', current_date, 100, 'USD', 20, $2, 'Rebeca', $3) returning id`, [HOTEL, status, RECEPTIONIST]
  )).rows[0].id;
  await db.query(`insert into public.google_sheets_outbox (hotel_id, entity_type, entity_id, payload, status) values ($1, 'tour', $2, '{}', $3)`, [HOTEL, id, outbox]);
  return id;
}
const outbox = async (id: string) => (await db.query<{ status: string }>(`select status from public.google_sheets_outbox where entity_id = $1`, [id])).rows[0]?.status;
async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('test.uid', '${userId}', false); set role authenticated;`);
  try { return await run(); } finally { await db.exec(`reset role;`); }
}
const update = (userId: string, id: string, change: string) => asUser(userId, async () => (await db.query(`update public.tour_bookings set ${change} where id = $1 returning id`, [id])).rows.length);

describe("migration 0029: edits re-sync to the Tours sheet", () => {
  it("editing any exported field re-queues the tour's sheet row", async () => {
    for (const change of ["guest_name = 'Luis'", "tour_date = current_date + 31", "total_price = 150", "commission_amount = 30", "adults = 3", "operator_name = 'Dolphin Tours'"]) {
      const id = await addTour();
      await update(RECEPTIONIST, id, change);
      expect([change, await outbox(id)]).toEqual([change, "pending"]);
    }
  });

  it("changes outside the sheet (notes) do not re-queue", async () => {
    const id = await addTour();
    await update(RECEPTIONIST, id, "notes = 'x'");
    expect(await outbox(id)).toBe("sent");
  });
});

describe("migration 0030: hide cancelled tours, never delete", () => {
  it("no app user can hard-delete a tour, whatever its status", async () => {
    for (const status of ["pending", "cancelled"]) {
      const id = await addTour(status);
      for (const user of [RECEPTIONIST, MANAGER]) {
        const deleted = await asUser(user, async () => (await db.query(`delete from public.tour_bookings where id = $1 returning id`, [id])).rows.length);
        expect([status, user, deleted]).toEqual([status, user, 0]);
      }
    }
  });

  it("a cancelled tour can be hidden; the row and its sheet row stay (hiding is not re-synced)", async () => {
    const id = await addTour("cancelled");
    expect(await update(RECEPTIONIST, id, "hidden = true, hidden_at = now()")).toBe(1);
    const row = (await db.query<{ status: string; hidden: boolean }>(`select status, hidden from public.tour_bookings where id = $1`, [id])).rows[0];
    expect(row).toEqual({ status: "cancelled", hidden: true });
    expect(await outbox(id)).toBe("sent");
  });

  it("a pending or paid tour cannot be hidden, and a hidden tour cannot leave cancelled", async () => {
    for (const status of ["pending", "paid"]) {
      const id = await addTour(status);
      await expect(update(RECEPTIONIST, id, "hidden = true")).rejects.toThrow(/tour_bookings_hidden_only_cancelled/);
    }
    const hidden = await addTour("cancelled");
    await update(RECEPTIONIST, hidden, "hidden = true");
    await expect(update(RECEPTIONIST, hidden, "status = 'pending'")).rejects.toThrow(/tour_bookings_hidden_only_cancelled/);
  });

  it("new tours are visible by default", async () => {
    const id = await addTour();
    expect((await db.query<{ hidden: boolean }>(`select hidden from public.tour_bookings where id = $1`, [id])).rows[0].hidden).toBe(false);
  });
});
