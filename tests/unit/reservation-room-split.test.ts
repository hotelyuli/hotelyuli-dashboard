// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { formatInTimeZone } from "date-fns-tz";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { pgClient } from "./support/pg-client";
import { parseCsv } from "@/features/csv-import/logic/parser";
import { addDays, formatBreakfastControl, formatBreakfastControlWhatsApp } from "@/features/operations/logic/breakfast-control";
import { evenSplit } from "@/features/operations/logic/pax";
import { materializeAfterImport } from "@/features/operations/services/materialize-after-import";
import { loadBreakfastControl } from "@/features/operations/services/breakfast-control-data";
import { reservationSplitsFor } from "@/features/operations/services/reservation-references";
import { BOARD_OPERATION_COLUMNS, buildBoardRows, type BoardOperation } from "@/features/operations/logic/board-rows";

/**
 * Migration 0033 (per-room pax split) with RLS on, driven by the REAL import, split actions and
 * breakfast-control loader. The real case of 27/10: Little Hotelier reservation "NRVA #25", one
 * booking over 12 rooms with 20 pax (18 adults + 2 children). Its rooms are imported with the
 * booking's whole pax each; only room 2's board row was marked "breakfast included, 2" by hand.
 * The control showed 2 covers instead of 20.
 */
const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const REC = "33333333-3333-4333-8333-333333333333";
const COOK = "44444444-4444-4444-8444-444444444444";
const TODAY = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
const ARRIVAL = addDays(TODAY, -1);
const DAY = TODAY; // breakfast on DAY: arrived the day before
const lh = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const ROOMS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "17", "18", "19"];

const session = { db: null as unknown as PGlite, uid: REC };
vi.mock("@/features/auth/logic/guards", () => ({ requireSession: async () => ({ supabase: pgClient(session.db, session.uid), user: { id: session.uid } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const { loadReservationSplit, saveReservationSplit } = await import("@/features/operations/actions");

const IN = "Reservation Number,Invoice Number,Guest Name,Check In,LoS,Room Number,Adults / Children / Infants,Extra Person,Outstanding Balance,Total Amount,ETA,Notes";
const nrva = (pax: string) => [IN, `NRVA #25,25,"Grupo, NRVA",${lh(ARRIVAL)},3,"${ROOMS.map((room) => `Room ${room}`).join(",")}",${pax},0,$0.00,$3000.00,,`].join("\n");

async function freshDb(upTo: string) {
  const db = await PGlite.create({ extensions: { citext, pgcrypto }, parsers: { 1082: (value: string) => value, 1700: (value: string) => Number(value) } });
  await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql") && name <= upTo).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(`grant usage on schema public, auth to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated; grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli');
    insert into auth.users (id) values ('${REC}'), ('${COOK}');
    insert into public.profiles (id, hotel_id, full_name, role) values ('${REC}', '${HOTEL}', 'Rebeca', 'reception'), ('${COOK}', '${HOTEL}', 'Cocina', 'restaurant');
    insert into public.rooms (hotel_id, unit_code, display_name, room_number, unit_type, sort_order) select '${HOTEL}', g::text, 'Room ' || g, g::text, 'room', g from generate_series(1, 19) g;
    insert into public.rooms (hotel_id, unit_code, display_name, room_number, unit_type, parent_room_number, sort_order) select '${HOTEL}', 'B' || g, 'Bed ' || g, '20', 'bunk', '20', 100 + g from generate_series(1, 6) g;`);
  return db;
}

async function runImport(db: PGlite, text: string, operationDate: string) {
  const parsed = parseCsv(text);
  const client = pgClient(db, REC);
  const hash = (await db.query<{ h: string }>("select encode(sha256(convert_to($1 || clock_timestamp()::text, 'UTF8')), 'hex') h", [text])).rows[0].h;
  const inserted = await client.from("reservation_imports").insert({ hotel_id: HOTEL, operation_date: operationDate, file_type: "check_in", file_name: "check_in.csv", content_hash: hash, row_count: parsed.rows.length, headers: parsed.headers, rows: JSON.stringify(parsed.rows), imported_by: REC }).select("id").single();
  return materializeAfterImport({ supabase: client as never, hotelId: HOTEL, operationDate, fileType: "check_in", headers: parsed.headers, rows: parsed.rows, sourceImportId: (inserted.data as { id: string }).id });
}

const control = (db: PGlite) => loadBreakfastControl(pgClient(db, REC) as never, HOTEL, DAY);
const lines = (summary: Awaited<ReturnType<typeof control>>["summary"]) => summary.lines.map((line) => [line.room, line.pax, line.included, line.breakfastPax, line.stayNote]);
const firstId = async (db: PGlite) => (await db.query<{ id: string }>("select r.id from public.reservations r join public.rooms rm on rm.id = r.room_id where r.reference = 'NRVA #25' and rm.unit_code = '2'")).rows[0].id;
const boardPax = async (db: PGlite, date: string) => (await db.query<{ room: string; total_pax: number; breakfast_status: string; breakfast_pax: number }>(
  "select rm.unit_code room, d.total_pax, d.breakfast_status, d.breakfast_pax from public.daily_operations d join public.rooms rm on rm.id = d.room_id where d.operation_date = $1 and d.reservation_id is not null order by rm.sort_order", [date])).rows.map((row) => [row.room, row.total_pax, row.breakfast_status, row.breakfast_pax]);

async function boardTotals(db: PGlite, date: string) {
  const client = pgClient(db, REC) as never as Parameters<typeof reservationSplitsFor>[0];
  const rooms = ((await client.from("rooms").select("id, display_name, room_number, sort_order, active, unit_code, unit_type").eq("hotel_id", HOTEL)).data ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const ops = ((await client.from("daily_operations").select(BOARD_OPERATION_COLUMNS).eq("hotel_id", HOTEL).eq("operation_date", date)).data ?? []) as unknown as BoardOperation[];
  const references = new Map(((await client.from("reservations").select("id, reference").eq("hotel_id", HOTEL)).data ?? []).map((row) => [row.id, row.reference]));
  const splits = await reservationSplitsFor(client, HOTEL, ops.map((row) => row.reservation_id));
  const rows = buildBoardRows({ rooms, operations: ops, references, toursForUnit: new Map(), splits });
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return { pax: sum(rows.map((row) => row.countedPax)), covers: sum(rows.map((row) => row.countedBreakfastPax)), warnings: rows.filter((row) => row.paxGroup).length };
}

describe("migration 0033 order", () => {
  it("refuses to run without 0032", async () => {
    const db = await freshDb("0031_zzz");
    await expect(db.exec(fs.readFileSync(path.join(MIGRATIONS, "0033_reservation_room_split.sql"), "utf8"))).rejects.toThrow(/requires 0032/);
  }, 60_000);
});

describe("NRVA #25: one booking over 12 rooms, 20 pax", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb("0033_reservation_room_split.sql");
    session.db = db;
    await runImport(db, nrva("18 / 2 / 0"), ARRIVAL);
    // The real board: only room 2 marked "breakfast included, 2 pax" by hand.
    await db.exec(`update public.daily_operations set breakfast_status = 'included', breakfast_pax = 2, manually_modified = true
      where room_id = (select id from public.rooms where unit_code = '2') and operation_date = '${ARRIVAL}'`);
  }, 120_000);

  it("investigation: the import puts the booking's whole 20 pax on every room; room 2 says 'included, 2' by hand", async () => {
    expect((await db.query<{ n: number; pax: number }>("select count(*)::int n, max(adults + children + babies) pax from public.reservations where reference = 'NRVA #25'")).rows[0]).toEqual({ n: 12, pax: 20 });
    const board = await boardPax(db, ARRIVAL);
    expect(board[0]).toEqual(["2", 20, "included", 2]);
    expect(board.slice(1).every(([, pax, status, covers]) => pax === 20 && status === "not_included" && covers === 0)).toBe(true);
  });

  it("(d) before any split: the control counts the 20 pax once (20 covers, not 2), 'reparto pendiente' on all 12 lines", async () => {
    const { summary, pending } = await control(db);
    expect(lines(summary)).toEqual([
      ["2", 20, true, 20, "Reserva en 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 17 + 18 + 19: reparto pendiente"],
      ...ROOMS.slice(1).map((room) => [room, 0, false, 0, "Misma reserva que 2 · reparto pendiente"])
    ]);
    expect([summary.guests, summary.includedPax]).toEqual([20, 20]);
    expect(pending).toEqual([{ reservationId: await firstId(db), reference: "NRVA #25", guest: "NRVA Grupo", rooms: ROOMS, pax: 20, resplit: false }]);
    const text = formatBreakfastControl({ date: DAY, summary });
    expect(text).toContain("Con desayuno incluido: 20 pax (1 hab.)");
    expect(formatBreakfastControlWhatsApp({ date: DAY, summary })).toContain("*Con desayuno incluido: 20 pax (1 hab.)*");
    // The Room board agrees: 20 pax, 20 covers, the warning on every room of the booking.
    expect(await boardTotals(db, ARRIVAL)).toEqual({ pax: 20, covers: 20, warnings: 12 });
  });

  it("the split dialog loads the 12 rooms in room order, breakfast on (room 2 has it)", async () => {
    session.uid = REC;
    const loaded = await loadReservationSplit(await firstId(db));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.data).toMatchObject({ reference: "NRVA #25", arrivalDate: ARRIVAL, state: "none", booking: { adults: 18, children: 2, babies: 0 }, breakfast: true });
    expect(loaded.data.rooms.map((room) => room.label)).toEqual(ROOMS.map((room) => `Room ${room}`));
  });

  it("refuses a split that doesn't add up, a missing room, a single-room booking and the restaurant role", async () => {
    const roomIds = (await loadReservationSplit(await firstId(db)) as { ok: true; data: { rooms: { roomId: string }[] } }).data.rooms.map((room) => room.roomId);
    const even = evenSplit({ adults: 18, children: 2, babies: 0 }, 12);
    const payload = (rooms: typeof even, ids = roomIds) => ({ reference: "NRVA #25", arrivalDate: ARRIVAL, breakfast: true, rooms: ids.map((roomId, index) => ({ roomId, ...rooms[index] })) });
    const short = even.map((room, index) => index === 0 ? { ...room, adults: room.adults - 1 } : room);
    expect(await saveReservationSplit(payload(short))).toMatchObject({ ok: false, error: expect.stringContaining("SPLIT_SUM") });
    // adults and children each add up, not only the total: 2 children moved into "adults" is refused
    const swapped = even.map((room) => ({ ...room, adults: room.adults + room.children, children: 0 }));
    expect(await saveReservationSplit(payload(swapped))).toMatchObject({ ok: false, error: expect.stringContaining("SPLIT_SUM") });
    expect(await saveReservationSplit(payload(even.slice(1), roomIds.slice(1)))).toMatchObject({ ok: false, error: expect.stringContaining("SPLIT_ROOMS") });
    session.uid = COOK;
    expect(await saveReservationSplit(payload(even))).toMatchObject({ ok: false, error: "NOT_AUTHORIZED" });
    session.uid = REC;
    await expect(db.query("select 1 from public.reservations where split_adults is not null")).resolves.toMatchObject({ rows: [] });
  });

  it("(a) 'Repartir parejo' + save, breakfast included: every room its own pax and covers (2 in the first 8 rooms, 1 in the last 4), total 20", async () => {
    const loaded = await loadReservationSplit(await firstId(db)) as { ok: true; data: { rooms: { roomId: string }[] } };
    const even = evenSplit({ adults: 18, children: 2, babies: 0 }, 12);
    expect(even.map((room) => room.adults + room.children)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1]);
    expect(await saveReservationSplit({ reference: "NRVA #25", arrivalDate: ARRIVAL, breakfast: true, rooms: loaded.data.rooms.map((room, index) => ({ roomId: room.roomId, ...even[index] })) })).toEqual({ ok: true });

    expect(await boardPax(db, ARRIVAL)).toEqual(ROOMS.map((room, index) => [room, even[index].adults + even[index].children, "included", even[index].adults + even[index].children]));
    const { summary, pending } = await control(db);
    expect(lines(summary)).toEqual(ROOMS.map((room, index) => [room, index < 8 ? 2 : 1, true, index < 8 ? 2 : 1, null]));
    expect([summary.guests, summary.includedPax, summary.includedRooms]).toEqual([20, 20, 12]);
    expect(pending).toEqual([]);
    const text = formatBreakfastControl({ date: DAY, summary }).split("\n");
    expect(text).toContain("2 · NRVA Grupo · 2 pax · ✅ DESAYUNO INCLUIDO");
    expect(text).toContain("19 · NRVA Grupo · 1 pax · ✅ DESAYUNO INCLUIDO");
    expect(text).toContain("Con desayuno incluido: 20 pax (12 hab.)");
    const whatsapp = formatBreakfastControlWhatsApp({ date: DAY, summary }).split("\n");
    expect(whatsapp).toContain("10 · NRVA Grupo · 1 pax · *DESAYUNO INCLUIDO*");
    expect(whatsapp).toContain("*Con desayuno incluido: 20 pax (12 hab.)*");
    expect(await boardTotals(db, ARRIVAL)).toEqual({ pax: 20, covers: 20, warnings: 0 });
  });

  it("(c) a plain re-import with no change keeps the split and the breakfast, on the next day's board too", async () => {
    await runImport(db, nrva("18 / 2 / 0"), TODAY);
    expect((await boardPax(db, TODAY)).map(([, pax, status, covers]) => [pax, status, covers])).toEqual(evenSplit({ adults: 18, children: 2, babies: 0 }, 12).map((room) => [room.adults + room.children, "included", room.adults + room.children]));
    expect(await boardTotals(db, TODAY)).toEqual({ pax: 20, covers: 20, warnings: 0 });
    expect((await control(db)).summary.includedPax).toBe(20);
  });

  it("(b) LH changes the booking to 22 pax + re-import: stale split dropped, breakfast kept, 22 covers once, 'repartir de nuevo'", async () => {
    await runImport(db, nrva("20 / 2 / 0"), TODAY);
    expect((await db.query("select reservation_pax::int p, split_pax::int s, needs_resplit from public.reservation_split_check where reference = 'NRVA #25'")).rows).toEqual([{ p: 22, s: 20, needs_resplit: true }]);
    // Every room carries the booking's 22 pax again, breakfast still included, covers 22 (never 0).
    expect(await boardPax(db, TODAY)).toEqual(ROOMS.map((room) => [room, 22, "included", 22]));
    expect(await boardTotals(db, TODAY)).toEqual({ pax: 22, covers: 22, warnings: 12 });
    const { summary, pending } = await control(db);
    expect([summary.guests, summary.includedPax]).toEqual([22, 22]);
    expect(summary.lines[0]).toMatchObject({ room: "2", pax: 22, included: true, breakfastPax: 22 });
    expect(summary.lines.every((line) => line.included && line.stayNote?.includes("la reserva cambió, repartir de nuevo"))).toBe(true);
    expect(pending[0]).toMatchObject({ reference: "NRVA #25", pax: 22, resplit: true });
    const loaded = await loadReservationSplit(await firstId(db));
    expect(loaded.ok && [loaded.data.state, loaded.data.breakfast]).toEqual(["resplit", true]);
  });

  it("(b) splitting again over 22 pax: covers follow the new split, total 22", async () => {
    const loaded = await loadReservationSplit(await firstId(db)) as { ok: true; data: { rooms: { roomId: string }[] } };
    const even = evenSplit({ adults: 20, children: 2, babies: 0 }, 12);
    expect(await saveReservationSplit({ reference: "NRVA #25", arrivalDate: ARRIVAL, breakfast: true, rooms: loaded.data.rooms.map((room, index) => ({ roomId: room.roomId, ...even[index] })) })).toEqual({ ok: true });
    expect(await boardTotals(db, TODAY)).toEqual({ pax: 22, covers: 22, warnings: 0 });
    expect((await control(db)).summary.includedPax).toBe(22);
  });

  it("a single-room booking can't be split", async () => {
    expect(await pgClient(db, REC).rpc("set_reservation_split", { p_reference: "NOPE", p_arrival: ARRIVAL, p_split: [] })).toMatchObject({ error: { message: expect.stringContaining("NOT_MULTI_ROOM") } });
  });
});
