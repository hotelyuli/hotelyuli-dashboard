import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { findHeaderRow, incomeRow, INCOME_HEADERS, moneyCell, textCell, tourRow, TOURS_HEADERS, type Cell, type IncomeRecord, type TourRecord } from "@/features/sheets/rows";
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

  it("income: booking channel as CATEGORIES when known, reservation date from the linked reservation", () => {
    expect(INCOME_HEADERS).toHaveLength(7);
    expect(incomeRow(income, { bookingChannel: "Booking.com", reservationDate: "2026-09-20" })).toEqual(["Booking.com", 150, "2026-09-24", "Room 5", "Ana Pérez", "Visa", "2026-09-20"]);
    expect(incomeRow({ ...income, room_number: null, reference_note: "Whale Watching · 2026-09-25" }, { bookingChannel: null, reservationDate: null }))
      .toEqual(["Accommodation", 150, "2026-09-24", "Whale Watching · 2026-09-25", "Ana Pérez", "Visa", ""]);
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

  function fakeGoogle(headerRow: string[], appendRange = "'Tours 2026'!A42:I42") {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body?.toString() });
      const json = (body: object, status = 200) => ({ ok: status < 400, status, statusText: "", json: async () => body });
      if (url.includes("oauth2")) return json({ access_token: "tok", expires_in: 3600 });
      if (url.includes("fields=sheets.properties.title")) return json({ sheets: [{ properties: { title: "Tours 2026" } }] });
      if (url.includes(":append")) return json({ updates: { updatedRange: appendRange } });
      if (url.includes("A1%3AI10")) return json({ values: [headerRow] });
      return json({});
    });
    return { client: createSheetsClient(keyFile, fetchImpl as unknown as typeof fetch), calls };
  }
  const target = { spreadsheetId: "14CZ", headers: TOURS_HEADERS };

  it("appends under the matching header row of the first tab, with USER_ENTERED + INSERT_ROWS", async () => {
    const { client, calls } = fakeGoogle([...TOURS_HEADERS]);
    await expect(client.append(target, tourRow(tour))).resolves.toBe("'Tours 2026'!A42:I42");
    const append = calls.find((call) => call.url.includes(":append"))!;
    expect(decodeURIComponent(append.url)).toContain("'Tours 2026'!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS");
    expect(JSON.parse(append.body!)).toEqual({ values: [tourRow(tour)] });
  });

  it("refuses to write when the tab's headers do not match", async () => {
    const { client, calls } = fakeGoogle(["DATE", "SOMETHING ELSE"]);
    await expect(client.append(target, tourRow(tour))).rejects.toThrow(/SHEETS_HEADER_MISMATCH/);
    expect(calls.some((call) => call.url.includes(":append"))).toBe(false);
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
    const sheetRows = new Map<string, unknown[]>();
    let next = 10;
    const sheets: SheetsWriter = {
      append: vi.fn(async (target, row: Cell[]) => { const range = `'${target.spreadsheetId}'!A${next}:I${next}`; next += 1; sheetRows.set(range, row); return range; }),
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
