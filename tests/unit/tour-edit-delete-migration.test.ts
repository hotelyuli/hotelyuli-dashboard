// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Migration 0029 against real Postgres with RLS on: edits/deletes re-queue the sheet; delete only without income. */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const RECEPTIONIST = "33333333-3333-4333-8333-333333333333";
const HOUSEKEEPER = "55555555-5555-4555-8555-555555555555";
let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name <= "0029_tour_edit_delete.sql").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "0029_tour_edit_delete.sql"), "utf8")); // re-run is safe
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli');
    insert into auth.users (id) values ('${RECEPTIONIST}'), ('${HOUSEKEEPER}');
    insert into public.profiles (id, hotel_id, full_name, role) values ('${RECEPTIONIST}', '${HOTEL}', 'Rebeca', 'reception'), ('${HOUSEKEEPER}', '${HOTEL}', 'Marcos', 'housekeeping');
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
async function addIncome(tourId: string) {
  await db.query(`insert into public.income_entries (hotel_id, operation_date, guest_name, category, amount, currency, payment_method, created_by, entry_type, source_type, source_id, settlement_seq)
    values ($1, current_date, 'Ana', 'Tour commission', 20, 'USD', 'Agency', $2, 'payment', 'tour', $3, 1)`, [HOTEL, RECEPTIONIST, tourId]);
}
const outbox = async (id: string) => (await db.query<{ status: string }>(`select status from public.google_sheets_outbox where entity_id = $1`, [id])).rows[0]?.status;
async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('test.uid', '${userId}', false); set role authenticated;`);
  try { return await run(); } finally { await db.exec(`reset role;`); }
}
const deleteTour = (userId: string, id: string) => asUser(userId, async () => (await db.query(`delete from public.tour_bookings where id = $1 returning id`, [id])).rows.length);

describe("migration 0029: edit + delete tours", () => {
  it("editing any exported field re-queues the tour's sheet row", async () => {
    for (const change of ["guest_name = 'Luis'", "tour_date = current_date + 31", "total_price = 150", "commission_amount = 30", "adults = 3", "operator_name = 'Dolphin Tours'"]) {
      const id = await addTour();
      await asUser(RECEPTIONIST, () => db.query(`update public.tour_bookings set ${change} where id = $1`, [id]));
      expect([change, await outbox(id)]).toEqual([change, "pending"]);
    }
  });

  it("changes outside the sheet (notes) do not re-queue", async () => {
    const id = await addTour();
    await asUser(RECEPTIONIST, () => db.query(`update public.tour_bookings set notes = 'x' where id = $1`, [id]));
    expect(await outbox(id)).toBe("sent");
  });

  it("an unpaid tour without income can be deleted, and its sheet row is re-queued for clearing", async () => {
    const id = await addTour("pending");
    expect(await deleteTour(RECEPTIONIST, id)).toBe(1);
    expect(await outbox(id)).toBe("pending");
  });

  it("a paid tour, or one with income history, cannot be deleted", async () => {
    const paid = await addTour("paid");
    await addIncome(paid);
    expect(await deleteTour(RECEPTIONIST, paid)).toBe(0);
    const reverted = await addTour("pending");
    await addIncome(reverted); // was paid once: its income stays linked
    expect(await deleteTour(RECEPTIONIST, reverted)).toBe(0);
    const cancelledPaidless = await addTour("cancelled");
    expect(await deleteTour(RECEPTIONIST, cancelledPaidless)).toBe(1);
  });

  it("housekeeping cannot delete tours", async () => {
    const id = await addTour("pending");
    expect(await deleteTour(HOUSEKEEPER, id)).toBe(0);
  });
});
