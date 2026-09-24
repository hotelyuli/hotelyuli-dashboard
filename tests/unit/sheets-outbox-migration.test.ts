// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Migration 0027 against real Postgres: backlog skipped, tour status changes re-queue, new statuses allowed. */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
let db: PGlite;

async function addTour(createdAt: string, status = "pending") {
  const id = (await db.query<{ id: string }>(
    `insert into public.tour_bookings (hotel_id, operation_date, guest_name, operator_name, tour_name, tour_date, total_price, currency, commission_amount, status, booked_by, created_by)
     values ($1, current_date, 'Ana', 'Ballena Tours', 'Whale Watching', current_date, 100, 'USD', 20, 'pending', 'Rebeca', $2) returning id`, [HOTEL, USER]
  )).rows[0].id;
  await db.query(`insert into public.google_sheets_outbox (hotel_id, entity_type, entity_id, payload, status, created_at) values ($1, 'tour', $2, '{}', $3, $4)`, [HOTEL, id, status, createdAt]);
  return id;
}
const outboxStatus = async (tourId: string) => (await db.query<{ status: string; last_error: string | null }>(`select status, last_error from public.google_sheets_outbox where entity_id = $1`, [tourId])).rows[0];

let oldTour: string;
let todayTour: string;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name < "0027").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(`insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli'); insert into auth.users (id) values ('${USER}');
    insert into public.profiles (id, hotel_id, full_name, role) values ('${USER}', '${HOTEL}', 'Rebeca', 'reception');`);
  oldTour = await addTour("2026-09-23 18:00:00-06");
  todayTour = await addTour("2026-09-24 08:30:00-06");
  const migration = fs.readFileSync(path.join(MIGRATIONS_DIR, "0027_sheets_export.sql"), "utf8");
  await db.exec(migration);
  await db.exec(migration); // re-run is safe
}, 60_000);

afterAll(async () => { await db?.close(); });

describe("migration 0027: Google Sheets export", () => {
  it("skips everything queued before 24 Sep 2026 (CR time) and keeps today's entries pending", async () => {
    expect(await outboxStatus(oldTour)).toMatchObject({ status: "skipped", last_error: expect.stringMatching(/^BACKLOG/) });
    expect(await outboxStatus(todayTour)).toMatchObject({ status: "pending" });
  });

  it("a tour's status change puts its sent row back in the queue", async () => {
    await db.query(`update public.google_sheets_outbox set status = 'sent', attempt_count = 2 where entity_id = $1`, [todayTour]);
    await db.query(`update public.tour_bookings set status = 'paid' where id = $1`, [todayTour]);
    const row = (await db.query<{ status: string; attempt_count: number }>(`select status, attempt_count from public.google_sheets_outbox where entity_id = $1`, [todayTour])).rows[0];
    expect(row).toEqual({ status: "pending", attempt_count: 0 });
  });

  it("edits that do not change the status, and backlog tours, are not re-queued", async () => {
    await db.query(`update public.google_sheets_outbox set status = 'sent' where entity_id = $1`, [todayTour]);
    await db.query(`update public.tour_bookings set notes = 'x' where id = $1`, [todayTour]);
    expect((await outboxStatus(todayTour)).status).toBe("sent");
    await db.query(`update public.tour_bookings set status = 'cancelled' where id = $1`, [oldTour]);
    expect((await outboxStatus(oldTour)).status).toBe("skipped");
  });

  it("allows the new statuses and still rejects unknown ones", async () => {
    await db.query(`update public.google_sheets_outbox set status = 'sending' where entity_id = $1`, [todayTour]);
    await expect(db.query(`update public.google_sheets_outbox set status = 'lost' where entity_id = $1`, [todayTour])).rejects.toThrow(/google_sheets_outbox_status_check/);
  });
});
