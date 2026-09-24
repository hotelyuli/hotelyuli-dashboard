import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { columnLetter, findHeaderLayout, findHeaderRow, fromSheetRow, headerKey, incomeRow, INCOME_HEADERS, moneyCell, monthTabName, tabKey, textCell, toSheetRow, tourRow, tourRowKey, TOURS_HEADERS, type Cell, type IncomeRecord, type TourRecord } from "@/features/sheets/rows";
import { createSheetsClient, parseServiceAccount, signServiceAccountJwt } from "@/features/sheets/google";
import { flushSheetsOutbox, type OutboxItem, type OutboxStore, type SheetsWriter } from "@/features/sheets/flush";

const tour: TourRecord = { id: "t1", tour_date: "2026-09-25", operator_name: "Ballena Tours", tour_name: "Whale Watching", guest_name: "Ana Pérez", adults: 2, children: 1, total_price: 150, commission_amount: 30, currency: "USD", status: "pending", booked_by: "Rebeca" };
const income: IncomeRecord = { id: "i1", operation_date: "2026-09-24", category: "Accommodation", amount: 150, currency: "USD", payment_method: "Visa", reference_note: null, guest_name: "Ana Pérez", room_number: "Habitación 5", paid: true, entry_type: "payment", reason: null };

describe("row mapping (exact sheet columns)", () => {
  it("tours: TOUR DATE | OPERATOR | TYPE | GUEST/PAX | TOTAL | COMISSION | STATUS | PAYMENT METHOD (blank) | BOOKED BY", () => {
    expect(TOURS_HEADERS).toHaveLength(9);
    expect(tourRow(tour)).toEqual(["2026-09-25", "Ballena Tours", "Whale Watching", "Ana Pérez / 3", 150, 30, "Pending", "", "Rebeca"]);
    expect(tourRow({ ...tour, status: "paid" })[6]).toBe("Paid");
    expect(tourRow({ ...tour, status: "cancelled" })[6]).toBe("Cancelled");
  });

  it("income: CATEGORIES is the stored booking channel, reservation date from the linked reservation", () => {
    expect(INCOME_HEADERS).toHaveLength(7);
    expect(incomeRow(income, { bookingChannel: "Booking.com", reservationDate: "2026-09-20" })).toEqual(["Booking.com", 150, "2026-09-24", "Room 5", "Ana Pérez", "Visa", "2026-09-20"]);
    expect(incomeRow(income, { bookingChannel: "Simple Booking", reservationDate: null })[0]).toBe("Simple Booking");
  });

  it("income: CATEGORIES is blank (never the internal category) when there is no channel", () => {
    expect(incomeRow({ ...income, category: "Tour commission", room_number: null, reference_note: "Whale Watching · 2026-09-25" }, { bookingChannel: null, reservationDate: null }))
      .toEqual(["", 150, "2026-09-24", "Whale Watching · 2026-09-25", "Ana Pérez", "Visa", ""]);
  });

  it("reversals are negative rows with the reason", () => {
    const row = incomeRow({ ...income, entry_type: "reversal", reason: "Cobro duplicado" }, { bookingChannel: null, reservationDate: null });
    expect(row[1]).toBe(-150);
    expect(row[3]).toBe("Anulación / Reversal: Cobro duplicado");
  });

  it("never mixes currencies: CRC is written as text, USD as a number", () => {
    expect(moneyCell("USD", 12.345)).toBe(12.35);
    expect(moneyCell("CRC", 5000)).toBe("CRC 5000.00");
    expect(moneyCell("CRC", -5000)).toBe("CRC -5000.00");
  });

  it("text that Sheets would run as a formula is forced to plain text", () => {
    expect(textCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(textCell("+50688887777")).toBe("'+50688887777");
    expect(textCell("Ana")).toBe("Ana");
  });

  it("finds the header row even below title rows, case/spacing-insensitive", () => {
    expect(findHeaderRow([["BOOKED TOURS 2026"], [], [" tour date", "TOUR  OPERATOR", "type of tour", "GUEST NAME/PAX QTY", "TOTAL TOUR", "TOTAL COMISSION", "STATUS", "PAYMENT METHOD", "BOOKED BY"]], TOURS_HEADERS)).toBe(2);
    expect(findHeaderRow([["DATE", "TOTAL"]], INCOME_HEADERS)).toBe(-1);
  });
});

describe("Google auth + client", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const keyFile = { client_email: "yulios@project.iam.gserviceaccount.com", private_key: pem };

  it("reads GOOGLE_SERVICE_ACCOUNT_JSON as base64 or raw JSON and rejects bad values", () => {
    const b64 = Buffer.from(JSON.stringify(keyFile)).toString("base64");
    expect(parseServiceAccount(b64).client_email).toBe(keyFile.client_email);
    expect(parseServiceAccount(JSON.stringify(keyFile)).client_email).toBe(keyFile.client_email);
    expect(() => parseServiceAccount("")).toThrow(/SHEETS_NOT_CONFIGURED/);
    expect(() => parseServiceAccount("bm90IGpzb24=")).toThrow(/SHEETS_BAD_CREDENTIALS/);
  });

  it("signs a valid RS256 service-account assertion for the spreadsheets scope", () => {
    const jwt = signServiceAccountJwt(keyFile, 1_000);
    const [header, claims, signature] = jwt.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({ iss: keyFile.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: 1_000, exp: 4_600 });
  });

  function fakeGoogle(tabs: Record<string, unknown[][]>) {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body?.toString() });
      const json = (body: object, status = 200) => ({ ok: status < 400, status, statusText: "", json: async () => body });
      const decoded = decodeURIComponent(url);
      if (url.includes("oauth2")) return json({ access_token: "tok", expires_in: 3600 });
      if (url.includes("fields=sheets.properties.title")) return json({ sheets: Object.keys(tabs).map((title) => ({ properties: { title } })) });
      if (url.includes(":batchUpdate")) {
        const title = JSON.parse(init.body!.toString()).requests[0].addSheet.properties.title as string;
        tabs[title] = [];
        return json({});
      }
      if (url.includes(":append")) return json({ updates: { updatedRange: `${decoded.split("/values/")[1].split("!")[0]}!A42:I42` } });
      const rangePart = decoded.split("/values/")[1]?.split("?")[0];
      if (rangePart && (init.method ?? "GET") === "GET") {
        // Reads: header scan (1:10), one row (A42:J42) or whole columns (A:J).
        const [rawTab, cells] = rangePart.split("!");
        const rows = tabs[rawTab.replace(/^'|'$/g, "")] ?? [];
        if (cells === "1:10") return json({ values: rows.slice(0, 10) });
        const single = /^A(\d+):/.exec(cells);
        if (single) return json({ values: rows[Number(single[1]) - 1] ? [rows[Number(single[1]) - 1]] : [] });
        return json({ values: rows });
      }
      return json({});
    });
    return { client: createSheetsClient(keyFile, fetchImpl as unknown as typeof fetch), calls };
  }
  const target = { spreadsheetId: "14CZ", headers: TOURS_HEADERS };

  it("appends to the existing monthly tab under its header row, with USER_ENTERED + INSERT_ROWS", async () => {
    const { client, calls } = fakeGoogle({ AGOSTO2026: [[...TOURS_HEADERS]], SEPTIEMBRE2026: [[...TOURS_HEADERS]] });
    await expect(client.append(target, "SEPTIEMBRE2026", tourRow(tour))).resolves.toBe("'SEPTIEMBRE2026'!A42:I42");
    const append = calls.find((call) => call.url.includes(":append"))!;
    expect(decodeURIComponent(append.url)).toContain("'SEPTIEMBRE2026'!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS");
    expect(JSON.parse(append.body!)).toEqual({ values: [tourRow(tour)] });
    expect(calls.some((call) => call.url.includes(":batchUpdate"))).toBe(false);
  });

  it("reuses an existing tab spelled SETIEMBRE / with spaces instead of creating a second one", async () => {
    const { client, calls } = fakeGoogle({ "Setiembre 2026": [[...TOURS_HEADERS]] });
    await expect(client.append(target, "SEPTIEMBRE2026", tourRow(tour))).resolves.toBe("'Setiembre 2026'!A42:I42");
    expect(calls.some((call) => call.url.includes(":batchUpdate"))).toBe(false);
  });

  it("creates a missing monthly tab and writes the header row before the first entry", async () => {
    const { client, calls } = fakeGoogle({ SEPTIEMBRE2026: [[...TOURS_HEADERS]] });
    await expect(client.append(target, "OCTUBRE2026", tourRow({ ...tour, tour_date: "2026-10-02" }))).resolves.toBe("'OCTUBRE2026'!A42:I42");
    const created = calls.find((call) => call.url.includes(":batchUpdate"))!;
    expect(JSON.parse(created.body!).requests[0].addSheet.properties.title).toBe("OCTUBRE2026");
    const header = calls.find((call) => call.method === "PUT")!;
    expect(decodeURIComponent(header.url)).toContain("'OCTUBRE2026'!A1:I1?valueInputOption=RAW");
    expect(JSON.parse(header.body!)).toEqual({ values: [[...TOURS_HEADERS]] });
    expect(calls.findIndex((call) => call.method === "PUT")).toBeLessThan(calls.findIndex((call) => call.url.includes(":append")));
  });

  it("refuses to write into a monthly tab whose headers do not match", async () => {
    const { client, calls } = fakeGoogle({ SEPTIEMBRE2026: [["DATE", "SOMETHING ELSE"]] });
    await expect(client.append(target, "SEPTIEMBRE2026", tourRow(tour))).rejects.toThrow(/SHEETS_HEADER_MISMATCH/);
    expect(calls.some((call) => call.url.includes(":append"))).toBe(false);
  });

  // The real BOOKED TOURS header row: a space after the slash, an extra COMPROBANTE # column, a trailing "Column 1".
  const REAL_TOURS = ["TOUR DATE", "TOUR OPERATOR", "TYPE OF TOUR", "GUEST NAME/ PAX QTY", "TOTAL TOUR", "TOTAL COMISSION", "STATUS", "PAYMENT METHOD", "COMPROBANTE #", "BOOKED BY", "Column 1"];

  it("maps each field to the real sheet's column by header name; unknown columns are left alone", async () => {
    const { client, calls } = fakeGoogle({ SEPTIEMBRE2026: [REAL_TOURS] });
    await client.append(target, "SEPTIEMBRE2026", tourRow(tour));
    const append = calls.find((call) => call.url.includes(":append"))!;
    expect(decodeURIComponent(append.url)).toContain("'SEPTIEMBRE2026'!A:J:append");
    // COMPROBANTE # (I) is null = skipped by Sheets; BOOKED BY lands in J; Column 1 (K) is not touched.
    expect(JSON.parse(append.body!).values[0]).toEqual([...tourRow(tour).slice(0, 8), null, "Rebeca"]);
  });

  it("matches headers in any order with extra spaces / case (income too)", async () => {
    const shuffled = ["Source of  Payment", "NOTES", "date", "TOTAL", "CATEGORIES", "client", "DESCRIPTION", " Reservation Date "];
    const { client, calls } = fakeGoogle({ SEPTIEMBRE2026: [["BOOKINGS INCOME"], shuffled] });
    const row = incomeRow(income, { bookingChannel: "Booking.com", reservationDate: "2026-09-20" });
    await client.append({ spreadsheetId: "1cWS", headers: INCOME_HEADERS }, "SEPTIEMBRE2026", row);
    const written = JSON.parse(calls.find((call) => call.url.includes(":append"))!.body!).values[0];
    expect(written).toEqual([row[5], null, row[2], row[1], row[0], row[4], row[3], row[6]]);
  });

  it("updating a tour rewrites only our columns (COMPROBANTE # kept) and reads rows back by header", async () => {
    const comprobante = "F-0091";
    const sheetRow = [...tourRow(tour).slice(0, 8), comprobante, "Rebeca", "x"];
    const rows = [REAL_TOURS, ...Array.from({ length: 40 }, () => [] as unknown[]), sheetRow];
    const { client, calls } = fakeGoogle({ SEPTIEMBRE2026: rows });
    // Google returns unquoted titles when they need no quotes.
    await expect(client.readRow(target, "SEPTIEMBRE2026!A42:K42")).resolves.toEqual(tourRow(tour));
    await expect(client.findTourRow(target, "SEPTIEMBRE2026", tourRowKey(tourRow(tour)))).resolves.toBe("'SEPTIEMBRE2026'!A42:J42");
    const paid = tourRow({ ...tour, status: "paid" });
    await client.update(target, "SEPTIEMBRE2026!A42:K42", paid);
    const put = calls.filter((call) => call.method === "PUT").at(-1)!;
    expect(decodeURIComponent(put.url)).toContain("'SEPTIEMBRE2026'!A42:J42?valueInputOption=USER_ENTERED");
    expect(JSON.parse(put.body!).values[0]).toEqual([...paid.slice(0, 8), null, "Rebeca"]);
  });

  it("the mismatch error names the missing headers", async () => {
    const { client } = fakeGoogle({ SEPTIEMBRE2026: [REAL_TOURS.filter((header) => header !== "BOOKED BY")] });
    await expect(client.append(target, "SEPTIEMBRE2026", tourRow(tour))).rejects.toThrow(/SHEETS_HEADER_MISMATCH: tab "SEPTIEMBRE2026" has no header row with BOOKED BY/);
  });
});

describe("header mapping", () => {
  it("ignores case and all whitespace, and finds columns wherever they sit", () => {
    expect(headerKey("GUEST NAME/ PAX QTY")).toBe(headerKey("guest name/pax qty"));
    expect(findHeaderLayout([["title"], ["TOUR DATE", "TOUR OPERATOR", "TYPE OF TOUR", "GUEST NAME/ PAX QTY", "TOTAL TOUR", "TOTAL COMISSION", "STATUS", "PAYMENT METHOD", "COMPROBANTE #", "BOOKED BY", "Column 1"]], TOURS_HEADERS))
      .toEqual({ rowIndex: 1, columns: [0, 1, 2, 3, 4, 5, 6, 7, 9] });
    expect(findHeaderLayout([["DATE", "TOTAL"]], INCOME_HEADERS)).toBeNull();
  });

  it("spreads a row onto sheet columns (nulls elsewhere) and reads it back", () => {
    expect(toSheetRow(["a", "b", "c"], [2, 0, 4])).toEqual(["b", null, "a", null, "c"]);
    expect(fromSheetRow(["b", "x", "a", "y", 5], [2, 0, 4])).toEqual(["a", "b", 5]);
    expect([0, 9, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(["A", "J", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
});

describe("monthly tab names", () => {
  it("uses the Spanish month in capitals + year, no space", () => {
    expect(monthTabName("2026-09-24")).toBe("SEPTIEMBRE2026");
    expect(monthTabName("2026-10-01")).toBe("OCTUBRE2026");
    expect(monthTabName("2027-01-15")).toBe("ENERO2027");
    expect(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => monthTabName(`2026-${m}-01`).replace("2026", "")))
      .toEqual(["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]);
    expect(() => monthTabName("not a date")).toThrow(/SHEETS_BAD_DATE/);
  });

  it("matches existing tabs loosely: case, spaces, accents, SETIEMBRE", () => {
    expect(tabKey("Setiembre 2026")).toBe(tabKey("SEPTIEMBRE2026"));
    expect(tabKey("octubre-2026")).toBe(tabKey("OCTUBRE2026"));
    expect(tabKey("SEPTIEMBRE2025")).not.toBe(tabKey("SEPTIEMBRE2026"));
  });
});

describe("flushSheetsOutbox", () => {
  const targets = { tours: { spreadsheetId: "T", headers: TOURS_HEADERS }, income: { spreadsheetId: "I", headers: INCOME_HEADERS } };

  function harness(items: OutboxItem[], data: { tours?: Record<string, TourRecord>; incomes?: Record<string, IncomeRecord> } = {}) {
    const state = new Map(items.map((item) => [item.id, { ...item, status: "sending", last_error: null as string | null }]));
    const store: OutboxStore = {
      claim: async () => [...state.values()].filter((item) => item.status === "sending").map(({ status, last_error, ...item }) => { void status; void last_error; return item; }),
      loadTour: async (id) => data.tours?.[id] ?? null,
      loadIncome: async (id) => (data.incomes?.[id] ? { income: data.incomes[id], enrichment: { bookingChannel: null, reservationDate: null } } : null),
      saveLocation: async (id, range, values) => { Object.assign(state.get(id)!, { sheet_range: range, sheet_values: values }); },
      markSent: async (id) => { state.get(id)!.status = "sent"; },
      markSkipped: async (id, reason) => { Object.assign(state.get(id)!, { status: "skipped", last_error: reason }); },
      markFailed: async (id, error, attempts) => { Object.assign(state.get(id)!, { status: "failed", last_error: error, attempt_count: attempts }); }
    };
    const sheetRows = new Map<string, Cell[]>();
    let next = 10;
    const sheets: SheetsWriter = {
      append: vi.fn(async (target, _tab: string, row: Cell[]) => { const range = `'${target.spreadsheetId}'!A${next}:I${next}`; next += 1; sheetRows.set(range, row); return range; }),
      readRow: vi.fn(async (_target, range: string) => sheetRows.get(range) ?? null),
      findTourRow: vi.fn(async () => null),
      update: vi.fn(async (_target, range: string, row: Cell[]) => { sheetRows.set(range, row); })
    };
    return { store, sheets, state, sheetRows };
  }
  const item = (overrides: Partial<OutboxItem>): OutboxItem => ({ id: "o1", entity_type: "tour", entity_id: "t1", attempt_count: 0, sheet_range: null, sheet_values: null, ...overrides });

  it("appends a new tour and remembers where", async () => {
    const h = harness([item({})], { tours: { t1: tour } });
    const result = await flushSheetsOutbox({ store: h.store, sheets: h.sheets, targets });
    expect(result).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(h.state.get("o1")).toMatchObject({ status: "sent", sheet_range: "'T'!A10:I10" });
  });

  it("routes each row to the monthly tab of its date (TOUR DATE for tours, DATE for income)", async () => {
    const h = harness([item({}), item({ id: "o2", entity_type: "income", entity_id: "i1" })], { tours: { t1: { ...tour, tour_date: "2026-10-03" } }, incomes: { i1: income } });
    await flushSheetsOutbox({ store: h.store, sheets: h.sheets, targets });
    expect(h.sheets.append).toHaveBeenCalledWith(targets.tours, "OCTUBRE2026", expect.any(Array));
    expect(h.sheets.append).toHaveBeenCalledWith(targets.income, "SEPTIEMBRE2026", expect.any(Array));
  });

  it("a tour that became paid updates its existing row instead of adding a duplicate", async () => {
    const h = harness([item({ sheet_range: "'T'!A10:I10", sheet_values: tourRow(tour) })], { tours: { t1: { ...tour, status: "paid" } } });
    h.sheetRows.set("'T'!A10:I10", tourRow(tour));
    await flushSheetsOutbox({ store: h.store, sheets: h.sheets, targets });
    expect(h.sheets.append).not.toHaveBeenCalled();
    expect(h.sheets.update).toHaveBeenCalledWith(targets.tours, "'T'!A10:I10", tourRow({ ...tour, status: "paid" }));
  });

  it("if the row was moved by hand it is re-found; if it is gone, a new row is appended", async () => {
    const moved = harness([item({ sheet_range: "'T'!A10:I10", sheet_values: tourRow(tour) })], { tours: { t1: { ...tour, status: "cancelled" } } });
    moved.sheetRows.set("'T'!A10:I10", ["2026-09-01", "Other", "Other", "Someone / 1"]);
    vi.mocked(moved.sheets.findTourRow).mockResolvedValueOnce("'T'!A57:I57");
    await flushSheetsOutbox({ store: moved.store, sheets: moved.sheets, targets });
    expect(moved.sheets.update).toHaveBeenCalledWith(targets.tours, "'T'!A57:I57", expect.any(Array));

    const gone = harness([item({ sheet_range: "'T'!A10:I10", sheet_values: tourRow(tour) })], { tours: { t1: tour } });
    await flushSheetsOutbox({ store: gone.store, sheets: gone.sheets, targets });
    expect(gone.sheets.append).toHaveBeenCalledTimes(1);
  });

  it("appends settled income, skips unpaid income, and never writes income twice", async () => {
    const h = harness([
      item({ id: "a", entity_type: "income", entity_id: "i1" }),
      item({ id: "b", entity_type: "income", entity_id: "i2" }),
      item({ id: "c", entity_type: "income", entity_id: "i3", sheet_range: "'I'!A5:G5" })
    ], { incomes: { i1: income, i2: { ...income, id: "i2", paid: false }, i3: { ...income, id: "i3" } } });
    const result = await flushSheetsOutbox({ store: h.store, sheets: h.sheets, targets });
    expect(result).toMatchObject({ sent: 2, skipped: 1 });
    expect(h.state.get("b")).toMatchObject({ status: "skipped", last_error: "SKIPPED: not settled (unpaid)" });
    expect(h.sheets.append).toHaveBeenCalledTimes(1);
  });

  it("records failures with the real error and counts the attempt", async () => {
    const h = harness([item({ attempt_count: 2 })], { tours: { t1: tour } });
    vi.mocked(h.sheets.append).mockRejectedValueOnce(new Error("SHEETS_API_403: The caller does not have permission (share the sheet with the service account email as Editor)"));
    const result = await flushSheetsOutbox({ store: h.store, sheets: h.sheets, targets });
    expect(result.failed).toBe(1);
    expect(h.state.get("o1")).toMatchObject({ status: "failed", attempt_count: 3 });
    expect(h.state.get("o1")!.last_error).toMatch(/SHEETS_API_403/);
  });
});

describe("flush per-row reporting", () => {
  it("returns and logs one line per row with the real outcome", async () => {
    const lines: string[] = [];
    const store: OutboxStore = {
      claim: async () => [
        { id: "a", entity_type: "tour", entity_id: "t1", attempt_count: 0, sheet_range: null, sheet_values: null },
        { id: "b", entity_type: "income", entity_id: "i1", attempt_count: 0, sheet_range: null, sheet_values: null }
      ],
      loadTour: async () => tour,
      loadIncome: async () => ({ income, enrichment: { bookingChannel: "Booking.com", reservationDate: null } }),
      saveLocation: async () => {}, markSent: async () => {}, markSkipped: async () => {}, markFailed: async () => {}
    };
    const sheets: SheetsWriter = {
      append: vi.fn(async (target) => { if (target.spreadsheetId === "I") throw new Error("SHEETS_API_403: The caller does not have permission (share the sheet with the service account email as Editor)"); return "'T'!A9:I9"; }),
      readRow: async () => null, findTourRow: async () => null, update: async () => {}
    };
    const result = await flushSheetsOutbox({ store, sheets, targets: { tours: { spreadsheetId: "T", headers: TOURS_HEADERS }, income: { spreadsheetId: "I", headers: INCOME_HEADERS } }, log: (line) => lines.push(line) });
    expect(result.items).toEqual([
      { entity_type: "tour", entity_id: "t1", outcome: "sent", detail: "tours 'T'!A9:I9" },
      { entity_type: "income", entity_id: "i1", outcome: "failed", detail: "SHEETS_API_403: The caller does not have permission (share the sheet with the service account email as Editor)" }
    ]);
    expect(lines).toEqual(["[sheets] tour t1: sent - tours 'T'!A9:I9", "[sheets] income i1: failed - SHEETS_API_403: The caller does not have permission (share the sheet with the service account email as Editor)"]);
  });
});
