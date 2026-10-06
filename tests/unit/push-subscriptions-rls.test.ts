// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Migration 0031 against real Postgres with RLS on: users see, add and remove only their own devices. */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const OTHER_HOTEL = "22222222-2222-4222-8222-222222222222";
const ANA = "33333333-3333-4333-8333-333333333333";
const LUIS = "66666666-6666-4666-8666-666666666666";
let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto } });
  await db.exec(`create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql") && name <= "0031_push_subscriptions.sql").sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "0031_push_subscriptions.sql"), "utf8")); // safe to re-run
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli'), ('${OTHER_HOTEL}', 'Other', 'other');
    insert into auth.users (id) values ('${ANA}'), ('${LUIS}');
    insert into public.profiles (id, hotel_id, full_name, role) values ('${ANA}', '${HOTEL}', 'Ana', 'reception'), ('${LUIS}', '${HOTEL}', 'Luis', 'manager');
  `);
}, 60_000);

afterAll(async () => { await db?.close(); });

async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('test.uid', '${userId}', false); set role authenticated;`);
  try { return await run(); } finally { await db.exec(`reset role;`); }
}
const insert = (userId: string, hotelId: string, endpoint: string) =>
  db.query(`insert into public.push_subscriptions (hotel_id, user_id, endpoint, p256dh, auth) values ($1, $2, $3, 'p', 'a')`, [hotelId, userId, endpoint]);

describe("migration 0031: push_subscriptions RLS", () => {
  it("a user can add their own device for their hotel only", async () => {
    await asUser(ANA, () => insert(ANA, HOTEL, "https://push.example/ana"));
    await expect(asUser(ANA, () => insert(LUIS, HOTEL, "https://push.example/fake"))).rejects.toThrow(/row-level security/);
    await expect(asUser(ANA, () => insert(ANA, OTHER_HOTEL, "https://push.example/other"))).rejects.toThrow(/row-level security/);
  });

  it("users only see and delete their own rows, and cannot update", async () => {
    await asUser(LUIS, () => insert(LUIS, HOTEL, "https://push.example/luis"));
    const seen = await asUser(ANA, async () => (await db.query<{ endpoint: string }>(`select endpoint from public.push_subscriptions`)).rows.map((row) => row.endpoint));
    expect(seen).toEqual(["https://push.example/ana"]);
    const deleted = await asUser(ANA, async () => (await db.query(`delete from public.push_subscriptions where endpoint = 'https://push.example/luis' returning id`)).rows.length);
    expect(deleted).toBe(0);
    const updated = await asUser(ANA, async () => (await db.query(`update public.push_subscriptions set failure_count = 9 returning id`)).rows.length);
    expect(updated).toBe(0);
    const own = await asUser(ANA, async () => (await db.query(`delete from public.push_subscriptions where endpoint = 'https://push.example/ana' returning id`)).rows.length);
    expect(own).toBe(1);
  });

  it("endpoints are unique and must be https", async () => {
    await expect(insert(LUIS, HOTEL, "https://push.example/luis")).rejects.toThrow(/duplicate key/);
    await expect(insert(LUIS, HOTEL, "http://push.example/plain")).rejects.toThrow(/check constraint/);
  });

  it("deleting the auth user removes their subscriptions", async () => {
    const temp = "77777777-7777-4777-8777-777777777777";
    await db.exec(`insert into auth.users (id) values ('${temp}')`);
    await insert(temp, HOTEL, "https://push.example/temp");
    await db.exec(`delete from auth.users where id = '${temp}'`);
    expect((await db.query(`select 1 from public.push_subscriptions where user_id = $1`, [temp])).rows).toHaveLength(0);
  });
});
