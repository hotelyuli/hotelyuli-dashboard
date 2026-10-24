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
import { addDays } from "@/features/operations/logic/breakfast-control";
import { materializeAfterImport } from "@/features/operations/services/materialize-after-import";
import { BOARD_OPERATION_COLUMNS, boardOccupancy, buildBoardRows, pendingBalances, type BoardOperation } from "@/features/operations/logic/board-rows";
import { inactiveReservations, loadRetirementReview, withActiveReservations } from "@/features/operations/services/active-reservations";
import type { RetirementCandidate } from "@/features/operations/services/retirement";

/**
 * Migration 0032 (reservation retirement) with RLS on, driven by the REAL import, confirmation,
 * review and dashboard code (through a PGlite adapter for the Supabase client). Hotel units: 19
 * rooms + Room 20's 6 beds = 25. The hotel's 24-10-2026 is replayed on "today" (Costa Rica), because
 * the database only ever retires dates from yesterday on: Bloom Jeramie (Room 14) cancelled in LH,
 * Umaña Ortega Nicole moved from Room 7 to Room 4, a third stale arrival (Pérez, Room 9) and a stale
 * departure (Quirós, Room 7). Expected: 4 check-ins, 7 departing room units.
 */
const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
const HOTEL = "11111111-1111-4111-8111-111111111111";
const REC = "33333333-3333-4333-8333-333333333333";
const D = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
const lh = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

const session = { db: null as unknown as PGlite };
vi.mock("@/features/auth/logic/guards", () => ({ requireSession: async () => ({ supabase: pgClient(session.db, "33333333-3333-4333-8333-333333333333"), user: { id: "33333333-3333-4333-8333-333333333333" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const { confirmImportRetirement } = await import("@/features/csv-import/actions");
const { reviewRetiredReservation } = await import("@/features/operations/actions");

const IN = "Reservation Number,Invoice Number,Guest Name,Check In,LoS,Room Number,Adults / Children / Infants,Extra Person,Outstanding Balance,Total Amount,ETA,Notes";
const OUT = "Reservation Number,Invoice Number,Guest Name,Check Out,LoS,Room Number,Adults / Children / Infants,Extra Person,Outstanding Balance,Total Amount,Notes";
const csv = (header: string, lines: string[]) => [header, ...lines].join("\n");
const T = lh(D);
// A booking staying through today over two rooms, with its balance repeated on both rows.
const STAYING = csv(IN, [`LH-W,20,"Weber, Max",${lh(addDays(D, -2))},4,"Room 5,Room 6",4 / 0 / 0,0,$60.00,$400.00,,`]);
const OLD_IN = csv(IN, [
  `LH-U,1,"Umaña Ortega, Nicole",${T},2,Room 7,2 / 0 / 0,0,$100.00,$200.00,,`,
  `LH-B,2,"Bloom, Jeramie",${T},3,Room 14,1 / 0 / 0,0,$50.33,$150.00,,`,
  `LH-P,3,"Pérez, Juan",${T},1,Room 9,2 / 0 / 0,0,$80.00,$80.00,,`
]);
const NEW_IN_LINES = [
  `LH-U,1,"Umaña Ortega, Nicole",${T},2,Room 4,2 / 0 / 0,0,$100.00,$200.00,,`,
  `LH-K,4,"King, Ada",${T},2,Room 14,2 / 0 / 0,0,$0.00,$300.00,,`,
  `LH-S,5,"Soto, Eva",${T},3,Room 16,2 / 0 / 0,0,$70.00,$300.00,,`,
  `LH-T,6,"Tan, Li",${T},1,Room 17,1 / 0 / 0,0,$30.00,$90.00,,`
];
const NEW_IN = csv(IN, NEW_IN_LINES);
const OLD_OUT = csv(OUT, [`LH-Q,9,"Quirós, Ana",${T},2,Room 7,2 / 0 / 0,0,$0.00,$100.00,`]);
const NEW_OUT = csv(OUT, [
  `LH-M,7,"Camacho Rodriguez, Marlon",${T},3,"Room 14,Room 18",4 / 1 / 0,0,$0.00,$500.00,`,
  `LH-C,8,"Carter, Nichola",${T},2,"Room 3,Room 19",2 / 0 / 0,0,$0.00,$200.00,`,
  `LH-T0,10,"Old, Guest",${T},2,Room 17,1 / 0 / 0,0,$0.00,$90.00,`,
  `LH-F,11,"Four, Guest",${T},2,Room 4,2 / 0 / 0,0,$0.00,$90.00,`,
  `LH-X,12,"Six, Guest",${T},2,Room 16,2 / 0 / 0,0,$0.00,$90.00,`
]);

async function freshDb(withRetirement: boolean) {
  const db = await PGlite.create({ extensions: { citext, pgcrypto }, parsers: { 1082: (value: string) => value, 1700: (value: string) => Number(value) } });
  await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql") && (withRetirement ? name <= "0032_reservation_retirement.sql" : name < "0032")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(`grant usage on schema public, auth to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated; grant execute on all functions in schema auth to authenticated;
    insert into public.hotels (id, name, slug) values ('${HOTEL}', 'Hotel Yuli', 'hotel-yuli');
    insert into auth.users (id) values ('${REC}');
    insert into public.profiles (id, hotel_id, full_name, role) values ('${REC}', '${HOTEL}', 'Rebeca', 'reception');
    insert into public.rooms (hotel_id, unit_code, display_name, room_number, unit_type, sort_order) select '${HOTEL}', g::text, 'Room ' || g, g::text, 'room', g from generate_series(1, 19) g;
    insert into public.rooms (hotel_id, unit_code, display_name, room_number, unit_type, parent_room_number, sort_order) select '${HOTEL}', 'B' || g, 'Bed ' || g, '20', 'bunk', '20', 100 + g from generate_series(1, 6) g;`);
  return db;
}

async function runImport(db: PGlite, text: string, fileType: "check_in" | "check_out", operationDate: string) {
  const parsed = parseCsv(text);
  const client = pgClient(db, REC);
  const hash = (await db.query<{ h: string }>("select encode(sha256(convert_to($1 || clock_timestamp()::text, 'UTF8')), 'hex') h", [text])).rows[0].h;
  const inserted = await client.from("reservation_imports").insert({ hotel_id: HOTEL, operation_date: operationDate, file_type: fileType, file_name: `${fileType}.csv`, content_hash: hash, row_count: parsed.rows.length, headers: parsed.headers, rows: JSON.stringify(parsed.rows), imported_by: REC }).select("id").single();
  const importId = (inserted.data as { id: string }).id;
  const result = await materializeAfterImport({ supabase: client as never, hotelId: HOTEL, operationDate, fileType, headers: parsed.headers, rows: parsed.rows, sourceImportId: importId });
  return { importId, ...result };
}

/** The dashboard's numbers, computed by the same code the dashboard runs. */
async function dashboard(db: PGlite) {
  const client = pgClient(db, REC) as never as Parameters<typeof inactiveReservations>[0];
  const count = async (column: "arrival_date" | "departure_date") => (await withActiveReservations((table) => client.from(table).select("id", { count: "exact", head: true }).eq("hotel_id", HOTEL).eq(column, D))).count;
  const [{ data: rooms }, { data: operations }] = await Promise.all([
    client.from("rooms").select("id, display_name, room_number, sort_order, active, unit_code, unit_type").eq("hotel_id", HOTEL),
    client.from("daily_operations").select(BOARD_OPERATION_COLUMNS).eq("hotel_id", HOTEL).eq("operation_date", D)
  ]);
  const ops = (operations ?? []) as unknown as BoardOperation[];
  const sortedRooms = [...(rooms ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const inactive = await inactiveReservations(client, HOTEL, ops.map((row) => row.reservation_id));
  const references = new Map(((await client.from("reservations").select("id, reference").eq("hotel_id", HOTEL)).data ?? []).map((row) => [row.id, row.reference]));
  const board = buildBoardRows({ rooms: sortedRooms, operations: ops, references, toursForUnit: new Map(), inactive });
  return { checkIns: await count("arrival_date"), checkOuts: await count("departure_date"), pending: pendingBalances(board), occupancy: boardOccupancy(board), board };
}
const idOf = async (db: PGlite, reference: string, unit: string) => (await db.query<{ id: string }>("select r.id from public.reservations r join public.rooms rm on rm.id = r.room_id where r.reference = $1 and rm.unit_code = $2", [reference, unit])).rows[0].id;
const states = async (db: PGlite, references: string[]) => Object.fromEntries((await db.query<{ reference: string; unit: string; retired_reason: string | null; review_flag: string | null }>(
  "select r.reference, rm.unit_code as unit, r.retired_reason, r.review_flag from public.reservations r join public.rooms rm on rm.id = r.room_id where r.reference = any($1)", [references])).rows.map((row) => [`${row.reference}/${row.unit}`, row.retired_reason ?? row.review_flag ?? "active"]));
const brief = (candidates: RetirementCandidate[] | undefined) => (candidates ?? []).map((c) => [c.room, c.guest, c.kind, c.lh_room, c.has_payment, c.lh_paid, c.may_be_extended]);

describe("today replayed as 24-10-2026, with migration 0032 and the deployment-1 code", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb(true);
    session.db = db;
    await runImport(db, STAYING, "check_in", addDays(D, -2));
    await runImport(db, OLD_IN, "check_in", addDays(D, -1));
    await runImport(db, OLD_OUT, "check_out", addDays(D, -1));
    // Bloom's stay has income: a manual entry naming its reference (rule 5).
    await db.query(`insert into public.income_entries (hotel_id, operation_date, guest_name, category, amount, currency, payment_method, reference_note, created_by)
      values ($1, $2, 'Bloom, Jeramie', 'Accommodation', 50, 'USD', 'Visa', 'Depósito LH-B', $3)`, [HOTEL, addDays(D, -1), REC]);
  }, 120_000);

  it("rule 1-2: the check-out file only lists the stale departure (may have been extended); nothing changes until a person confirms it", async () => {
    const { importId, retirement } = await runImport(db, NEW_OUT, "check_out", D);
    expect(retirement?.status).toBe("needs_confirmation");
    // Her board row yesterday says Pagado only because LH's balance is 0 (not edited by hand, no income):
    // has_payment = false, shown as the "Pagado (LH)" chip.
    expect(brief(retirement?.candidates)).toEqual([["Room 7", "Quirós, Ana", "missing_from_import", null, false, true, true]]);
    expect((await dashboard(db)).checkOuts).toBe(8);
    expect(await confirmImportRetirement(importId, [await idOf(db, "LH-Q", "7")])).toEqual({ ok: true });
    expect((await dashboard(db)).checkOuts).toBe(7);
  });

  it("rule 1 + 5: the check-in file lists 3 candidates, Bloom flagged has_payment; only the ticked ids change", async () => {
    const { importId, retirement } = await runImport(db, NEW_IN, "check_in", D);
    expect(retirement?.status).toBe("needs_confirmation");
    expect(brief(retirement?.candidates)).toEqual([
      ["Room 14", "Bloom, Jeramie", "missing_from_import", null, true, false, false],
      ["Room 7", "Umaña Ortega, Nicole", "moved_in_lh", "Room 4", false, false, false],
      ["Room 9", "Pérez, Juan", "missing_from_import", null, false, false, false]
    ]);
    expect((await dashboard(db)).checkIns).toBe(7); // the inflated number the hotel saw
    // The person ticks Umaña's Room 7 row and Pérez, not Bloom (red, has a payment).
    expect(await confirmImportRetirement(importId, [await idOf(db, "LH-U", "7"), await idOf(db, "LH-P", "9")])).toEqual({ ok: true });
    expect(await states(db, ["LH-B", "LH-U", "LH-P"])).toEqual({ "LH-B/14": "active", "LH-U/7": "moved_in_lh", "LH-U/4": "active", "LH-P/9": "missing_from_import" });
    expect((await dashboard(db)).checkIns).toBe(5);
    // Then Bloom, explicitly, on its own.
    expect(await confirmImportRetirement(importId, [await idOf(db, "LH-B", "14")])).toEqual({ ok: true });
  });

  it("KPIs: 4 check-ins, 7 departing room units, pending = active balances once per booking, occupancy of 25 units", async () => {
    const kpi = await dashboard(db);
    expect(kpi.checkIns).toBe(4);   // Rooms 4, 14 (King), 16, 17
    expect(kpi.checkOuts).toBe(7);  // room units: 14 + 18, 3 + 19, 17, 4, 16 (5 reservations)
    // Umaña 100 + Soto 70 + Tan 30 (King 0) + Weber 60 once (Rooms 5 and 6). Not Bloom 50.33, Pérez 80, Umaña Room 7 100.
    expect(kpi.pending).toEqual({ USD: 260, CRC: 0, bookings: 4 });
    expect(kpi.occupancy).toMatchObject({ occupied: 6, capacity: 25 });
    const room = (label: string) => kpi.board.find((row) => row.roomLabel === label)!;
    expect([room("Room 7").guestName, room("Room 9").guestName, room("Room 14").guestName]).toEqual([null, null, "King, Ada"]);
  });

  it("the review panel lists them, Pérez included; they already don't count", async () => {
    const items = await loadRetirementReview(pgClient(db, REC) as never, HOTEL, addDays(D, -1));
    expect(items.map((item) => [item.guest, item.kind, item.lhRoom]).sort()).toEqual([
      ["Bloom, Jeramie", "missing_from_import", null],
      ["Pérez, Juan", "missing_from_import", null],
      ["Quirós, Ana", "missing_from_import", null],
      ["Umaña Ortega, Nicole", "moved_in_lh", "Room 4"]
    ]);
  });

  it("Restaurar: Pérez counts again, its room is rebuilt, and the next import doesn't list it again", async () => {
    const data = new FormData(); data.set("reservationId", await idOf(db, "LH-P", "9")); data.set("decision", "restore");
    expect(await reviewRetiredReservation(data)).toEqual({ ok: true });
    expect((await dashboard(db)).checkIns).toBe(5);
    const again = await runImport(db, NEW_IN, "check_in", D);
    expect(again.retirement?.status).toBe("none");
    expect((await dashboard(db)).checkIns).toBe(5);
  });

  it("Confirmar on the moved row retires it as moved_in_lh", async () => {
    const data = new FormData(); data.set("reservationId", await idOf(db, "LH-U", "7")); data.set("decision", "confirm");
    expect(await reviewRetiredReservation(data)).toEqual({ ok: true });
    expect(await states(db, ["LH-U"])).toMatchObject({ "LH-U/7": "moved_in_lh" });
    expect((await db.query("select review_flag, reviewed_at is not null as reviewed from public.reservations where id = $1", [await idOf(db, "LH-U", "7")])).rows[0]).toEqual({ review_flag: null, reviewed: true });
  });

  it("a row Little Hotelier lists again is active again", async () => {
    await runImport(db, csv(IN, [...NEW_IN_LINES, `LH-B,2,"Bloom, Jeramie",${T},3,Room 14,1 / 0 / 0,0,$50.33,$150.00,,`]), "check_in", D);
    expect(await states(db, ["LH-B"])).toEqual({ "LH-B/14": "active" });
  });
});

describe("rules 1, 3-6 on their own", () => {
  let db: PGlite;
  beforeAll(async () => { db = await freshDb(true); session.db = db; }, 120_000);
  const rpc = async (importId: string, seen: unknown, extra = "") => (await db.query<{ r: Record<string, unknown> }>(`select public.retire_missing_from_import('${importId}', 'check_in', $1::jsonb${extra}) as r`, [JSON.stringify(seen)])).rows[0].r;
  const asRec = async <R>(run: () => Promise<R>) => { await db.exec(`select set_config('test.uid', '${REC}', false); set role authenticated;`); try { return await run(); } finally { await db.exec("reset role;"); } };

  it("rule 3: a line with a room the resolver doesn't know -> that date is skipped, nothing listed or retired", async () => {
    const d = addDays(D, 1);
    await runImport(db, csv(IN, [`LH-1,1,"Ana",${lh(d)},1,Room 2,1 / 0 / 0,0,$0.00,$50.00,,`, `LH-2,2,"Luis",${lh(d)},1,Room 3,1 / 0 / 0,0,$0.00,$50.00,,`]), "check_in", D);
    const { retirement } = await runImport(db, csv(IN, [`LH-1,1,"Ana",${lh(d)},1,Room 2,1 / 0 / 0,0,$0.00,$50.00,,`, `LH-9,9,"Eva",${lh(d)},1,"Room 5,Suite Azul",1 / 0 / 0,0,$0.00,$50.00,,`]), "check_in", D);
    expect(retirement).toMatchObject({ status: "none", skipped_dates: [{ date: d, reason: "unresolved_room" }] });
    expect(await states(db, ["LH-2"])).toEqual({ "LH-2/3": "active" });
  });

  it("rule 3: a line that can't be read at all -> the whole file is skipped", async () => {
    const { retirement } = await runImport(db, csv(IN, [`LH-1,1,"Ana",${lh(addDays(D, 1))},1,Room 2,1 / 0 / 0,0,$0.00,$50.00,,`, `LH-8,8,"Bad",not-a-date,1,Room 6,1 / 0 / 0,0,$0.00,$50.00,,`]), "check_in", D);
    expect(retirement).toMatchObject({ status: "skipped_file", invalid_rows: 1 });
  });

  it("rule 4: dates before yesterday (Costa Rica) are never touched", async () => {
    const old = addDays(D, -3);
    await runImport(db, csv(IN, [`LH-O1,1,"Old One",${lh(old)},5,Room 8,1 / 0 / 0,0,$0.00,$50.00,,`, `LH-O2,2,"Old Two",${lh(old)},5,Room 10,1 / 0 / 0,0,$0.00,$50.00,,`]), "check_in", old);
    const { importId, retirement } = await runImport(db, csv(IN, [`LH-O1,1,"Old One",${lh(old)},5,Room 8,1 / 0 / 0,0,$0.00,$50.00,,`]), "check_in", D);
    expect(retirement).toMatchObject({ status: "none", skipped_dates: [{ date: old, reason: "too_old" }] });
    const room10 = (await db.query<{ id: string }>("select id from public.rooms where unit_code = '10'")).rows[0].id;
    expect(await asRec(() => rpc(importId, [{ date: old, reference: "LH-O1", guest: "Old One", room_id: room10 }], ", true"))).toMatchObject({ status: "none" });
    expect(await states(db, ["LH-O2"])).toEqual({ "LH-O2/10": "active" });
  });

  it("rule 1 + 5 in SQL: has_payment = money in YuliOS only; p_confirm without p_only never takes it; p_only takes exactly the ticked ids", async () => {
    const d = addDays(D, 2);
    await runImport(db, csv(IN, [1, 2, 3].map((n) => `LH-R${n},${n},"Guest ${n}",${lh(d)},1,Room ${10 + n},1 / 0 / 0,0,$0.00,$50.00,,`)), "check_in", D);
    const paidRow = await idOf(db, "LH-R1", "11");
    // R1: Pagado set by hand (money in YuliOS). R2: Pagado only because LH's balance is 0 ("Pagado (LH)").
    // R3: Parcial (always money in YuliOS, even without the manual flag).
    await db.query("insert into public.daily_operations (hotel_id, operation_date, room_id, reservation_id, guest_name, operational_status, payment_status, outstanding_balance, manually_modified) select $1, $2, room_id, id, guest_name, 'check_in', 'paid', 0, true from public.reservations where id = $3", [HOTEL, d, paidRow]);
    await db.query("insert into public.daily_operations (hotel_id, operation_date, room_id, reservation_id, guest_name, operational_status, payment_status, outstanding_balance, manually_modified) select $1, $2, room_id, id, guest_name, 'check_in', 'paid', 0, false from public.reservations where id = $3", [HOTEL, addDays(D, 1), await idOf(db, "LH-R2", "12")]);
    await db.query("insert into public.daily_operations (hotel_id, operation_date, room_id, reservation_id, guest_name, operational_status, payment_status, outstanding_balance, manually_modified) select $1, $2, room_id, id, guest_name, 'staying', 'partial', 20, false from public.reservations where id = $3", [HOTEL, addDays(D, 1), await idOf(db, "LH-R3", "13")]);
    const { importId, retirement } = await runImport(db, csv(IN, []), "check_in", D);
    expect(retirement?.status).toBe("none"); // an empty file lists no date, so it can retire nothing
    const seen = [{ date: d, reference: "LH-X", guest: "Someone", room_id: (await db.query<{ id: string }>("select id from public.rooms where unit_code = '1'")).rows[0].id }];
    const listed = await asRec(() => rpc(importId, seen)) as { status: string; candidates: RetirementCandidate[] };
    expect([listed.status, listed.candidates.map((c) => [c.room, c.has_payment, c.lh_paid])]).toEqual(["needs_confirmation", [["Room 11", true, false], ["Room 12", false, true], ["Room 13", true, false]]]);
    expect(await asRec(() => rpc(importId, seen, ", true"))).toMatchObject({ status: "applied", retired: 1 });
    expect(await states(db, ["LH-R1", "LH-R2", "LH-R3"])).toEqual({ "LH-R1/11": "active", "LH-R2/12": "missing_from_import", "LH-R3/13": "active" });
    expect(await asRec(() => rpc(importId, seen, `, true, array['${paidRow}']::uuid[]`))).toMatchObject({ status: "applied", retired: 1 });
    expect(await states(db, ["LH-R1"])).toEqual({ "LH-R1/11": "missing_from_import" });
  });

  it("rule 6: board rows of retired reservations are never deleted; a hand-edited or paid one is never overwritten, only hidden", async () => {
    const d = addDays(D, 2);
    const rows = await db.query<{ room_id: string; guest_name: string; payment_status: string; manually_modified: boolean }>(
      "select d.room_id, d.guest_name, d.payment_status, d.manually_modified from public.daily_operations d join public.reservations r on r.id = d.reservation_id where r.reference = 'LH-R1' and d.operation_date = $1", [d]);
    expect(rows.rows).toEqual([expect.objectContaining({ guest_name: "Guest 1", payment_status: "paid", manually_modified: true })]);
    await runImport(db, csv(IN, []), "check_in", d); // rebuilds the board for that day
    expect((await db.query("select count(*)::int c from public.daily_operations d join public.reservations r on r.id = d.reservation_id where r.reference = 'LH-R1' and d.operation_date = $1", [d])).rows[0]).toEqual({ c: 1 });
    const inactive = await inactiveReservations(pgClient(db, REC) as never, HOTEL, [await idOf(db, "LH-R1", "11")]);
    expect([...inactive.values()].map((info) => info.reason)).toEqual(["missing_from_import"]);
  });
});

describe("the deployment-1 code before migration 0032 is applied", () => {
  it("imports, the board and the KPIs work as before (nothing retired, nothing breaks)", async () => {
    const db = await freshDb(false);
    session.db = db;
    await runImport(db, OLD_IN, "check_in", addDays(D, -1));
    const { retirement, warnings } = await runImport(db, NEW_IN, "check_in", D);
    expect([retirement, warnings]).toEqual([null, []]);
    expect((await dashboard(db)).checkIns).toBe(7);
    expect(await loadRetirementReview(pgClient(db, REC) as never, HOTEL, D)).toEqual([]);
  }, 120_000);
});
