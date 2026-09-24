import { createSign } from "node:crypto";
import { columnLetter, findHeaderLayout, fromSheetRow, missingHeaders, tabKey, toSheetRow, tourRowKey, type Cell, type HeaderLayout } from "./rows";

// Server-only Google Sheets client: service-account JWT (RS256) -> OAuth token ->
// Sheets REST v4. No SDK dependency; nothing here is imported by client code.

export type ServiceAccount = { client_email: string; private_key: string };
/** A spreadsheet; the tab is chosen per row (monthly tabs, e.g. SEPTIEMBRE2026). */
export type SheetTarget = { spreadsheetId: string; headers: readonly string[] };
/** A verified monthly tab: its exact title, header row (1-based) and where each of our fields sits. */
export type TabLayout = { title: string; headerRow: number; columns: number[]; lastColumn: string };

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsError extends Error {}

/** GOOGLE_SERVICE_ACCOUNT_JSON: base64 of the key file (raw JSON is also accepted). */
export function parseServiceAccount(value: string | undefined): ServiceAccount {
  if (!value?.trim()) throw new SheetsError("SHEETS_NOT_CONFIGURED: GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const text = value.trim().startsWith("{") ? value.trim() : Buffer.from(value.trim(), "base64").toString("utf8");
  let parsed: Partial<ServiceAccount>;
  try { parsed = JSON.parse(text); } catch { throw new SheetsError("SHEETS_BAD_CREDENTIALS: GOOGLE_SERVICE_ACCOUNT_JSON is not valid (base64) JSON"); }
  if (!parsed.client_email || !parsed.private_key) throw new SheetsError("SHEETS_BAD_CREDENTIALS: the key file has no client_email / private_key");
  return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
}

const base64url = (input: string | Buffer) => Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Signed service-account assertion for the OAuth token exchange. */
export function signServiceAccountJwt(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${base64url(signer.sign(account.private_key))}`;
}

/** The tab and row number of a stored range like 'SEPTIEMBRE2026'!A42:I42 or SEPTIEMBRE2026!A42. */
export function parseRowRange(range: string): { tab: string; row: number } {
  const match = /^(.*)!\$?[A-Z]+\$?(\d+)/.exec(range);
  if (!match) throw new SheetsError(`SHEETS_BAD_RANGE: cannot read "${range}"`);
  const tab = match[1].startsWith("'") && match[1].endsWith("'") ? match[1].slice(1, -1).replace(/''/g, "'") : match[1];
  return { tab, row: Number(match[2]) };
}

type Fetch = typeof fetch;

export function createSheetsClient(account: ServiceAccount, fetchImpl: Fetch = fetch) {
  let token: { value: string; expiresAt: number } | null = null;
  const tabTitles = new Map<string, string[]>(); // spreadsheetId -> tab titles
  const layouts = new Map<string, TabLayout>(); // "spreadsheetId|title" -> verified header mapping

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signServiceAccountJwt(account) })
    });
    const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!response.ok || !body.access_token) throw new SheetsError(`SHEETS_AUTH_FAILED ${response.status}: ${body.error_description ?? body.error ?? "no token"}`);
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!response.ok) {
      const hint = response.status === 403 ? " (share the sheet with the service account email as Editor)" : response.status === 404 ? " (check the spreadsheet ID)" : "";
      throw new SheetsError(`SHEETS_API_${response.status}: ${body.error?.message ?? response.statusText}${hint}`);
    }
    return body;
  }

  const quote = (title: string) => `'${title.replace(/'/g, "''")}'`;
  const valuesUrl = (target: SheetTarget, range: string) => `${API}/${target.spreadsheetId}/values/${encodeURIComponent(range)}`;
  /** One sheet row, from column A to our right-most column, e.g. 'SEPTIEMBRE2026'!A42:J42. */
  const rowRange = (layout: TabLayout, row: number) => `${quote(layout.title)}!A${row}:${layout.lastColumn}${row}`;

  async function listTabs(spreadsheetId: string, refresh = false): Promise<string[]> {
    const cached = tabTitles.get(spreadsheetId);
    if (cached && !refresh) return cached;
    const meta = await call<{ sheets?: { properties?: { title?: string } }[] }>(`${API}/${spreadsheetId}?fields=sheets.properties.title`);
    const titles = (meta.sheets ?? []).flatMap((sheet) => (sheet.properties?.title ? [sheet.properties.title] : []));
    tabTitles.set(spreadsheetId, titles);
    return titles;
  }

  const findTab = (titles: string[], wanted: string) => titles.find((title) => tabKey(title) === tabKey(wanted));

  /**
   * The monthly tab to write to, created (with the header row) when it does not exist,
   * and where each of our fields sits in it. An existing tab is matched loosely
   * (SETIEMBRE = SEPTIEMBRE, case/spaces ignored). Its header row may hold our columns
   * in any order among extra columns (COMPROBANTE #, Column 1, ...); each is matched by
   * name, case and spaces ignored. An empty tab gets our header row; a tab missing any
   * of our headers is refused.
   */
  async function ensureTab(target: SheetTarget, wanted: string): Promise<TabLayout> {
    let title = findTab(await listTabs(target.spreadsheetId), wanted);
    if (!title) {
      try {
        await call(`${API}/${target.spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: wanted, gridProperties: { frozenRowCount: 1 } } } }] }) });
        title = wanted;
      } catch (error) {
        // Another run created it a moment ago: use that one.
        title = findTab(await listTabs(target.spreadsheetId, true), wanted);
        if (!title) throw error;
      }
      tabTitles.set(target.spreadsheetId, [...(tabTitles.get(target.spreadsheetId) ?? []).filter((t) => t !== title), title]);
    }
    const key = `${target.spreadsheetId}|${title}`;
    const cached = layouts.get(key);
    if (cached) return cached;
    const data = await call<{ values?: unknown[][] }>(`${valuesUrl(target, `${quote(title)}!1:10`)}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows = data.values ?? [];
    let found: HeaderLayout | null;
    if (!rows.some((row) => row.some((cell) => String(cell ?? "").trim()))) {
      await call(`${valuesUrl(target, `${quote(title)}!A1:${columnLetter(target.headers.length - 1)}1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[...target.headers]] }) });
      found = { rowIndex: 0, columns: target.headers.map((_, index) => index) };
    } else {
      found = findHeaderLayout(rows, target.headers);
      if (!found) throw new SheetsError(`SHEETS_HEADER_MISMATCH: tab "${title}" has no header row with ${missingHeaders(rows, target.headers).join(" | ")} (checked the first 10 rows)`);
    }
    const layout: TabLayout = { title, headerRow: found.rowIndex + 1, columns: found.columns, lastColumn: columnLetter(Math.max(...found.columns)) };
    layouts.set(key, layout);
    return layout;
  }

  return {
    ensureTab,
    /**
     * Appends one row under the table of the given monthly tab, each value in the column
     * with its header; columns we do not own stay empty. Returns the A1 range written.
     */
    async append(target: SheetTarget, tab: string, row: Cell[]): Promise<string> {
      const layout = await ensureTab(target, tab);
      const result = await call<{ updates?: { updatedRange?: string } }>(
        `${valuesUrl(target, `${quote(layout.title)}!A:${layout.lastColumn}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: [toSheetRow(row, layout.columns)] }) }
      );
      const range = result.updates?.updatedRange;
      if (!range) throw new SheetsError("SHEETS_APPEND_NO_RANGE: Google did not report where the row was written");
      return range;
    },
    /** The row at `range`, read back into our header order; null if it is empty. */
    async readRow(target: SheetTarget, range: string): Promise<Cell[] | null> {
      const { tab, row } = parseRowRange(range);
      const layout = await ensureTab(target, tab);
      const data = await call<{ values?: unknown[][] }>(`${valuesUrl(target, rowRange(layout, row))}?valueRenderOption=UNFORMATTED_VALUE`);
      return data.values?.[0] ? fromSheetRow(data.values[0], layout.columns) : null;
    },
    /** Last row of the monthly tab whose operator / tour / guest columns match `key` (see tourRowKey); null if none. */
    async findTourRow(target: SheetTarget, tab: string, key: string): Promise<string | null> {
      if (!findTab(await listTabs(target.spreadsheetId), tab)) return null;
      const layout = await ensureTab(target, tab);
      const data = await call<{ values?: unknown[][] }>(`${valuesUrl(target, `${quote(layout.title)}!A:${layout.lastColumn}`)}?valueRenderOption=UNFORMATTED_VALUE`);
      const rows = data.values ?? [];
      for (let index = rows.length - 1; index >= layout.headerRow; index -= 1) {
        if (tourRowKey(fromSheetRow(rows[index] ?? [], layout.columns)) === key) return rowRange(layout, index + 1);
      }
      return null;
    },
    /**
     * Rewrites our columns of the row at `range`. Other cells are sent as null, which
     * Sheets skips - so COMPROBANTE # and other hand-filled columns are left untouched.
     */
    async update(target: SheetTarget, range: string, row: Cell[]): Promise<void> {
      const { tab, row: rowNumber } = parseRowRange(range);
      const layout = await ensureTab(target, tab);
      await call(`${valuesUrl(target, rowRange(layout, rowNumber))}?valueInputOption=USER_ENTERED`, { method: "PUT", body: JSON.stringify({ values: [toSheetRow(row, layout.columns)] }) });
    }
  };
}

export type SheetsClient = ReturnType<typeof createSheetsClient>;
