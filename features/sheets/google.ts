import { createSign } from "node:crypto";
import { findHeaderRow, tabKey, tourRowKey, type Cell } from "./rows";

// Server-only Google Sheets client: service-account JWT (RS256) -> OAuth token ->
// Sheets REST v4. No SDK dependency; nothing here is imported by client code.

export type ServiceAccount = { client_email: string; private_key: string };
/** A spreadsheet; the tab is chosen per row (monthly tabs, e.g. SEPTIEMBRE2026). */
export type SheetTarget = { spreadsheetId: string; headers: readonly string[] };

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

type Fetch = typeof fetch;

export function createSheetsClient(account: ServiceAccount, fetchImpl: Fetch = fetch) {
  let token: { value: string; expiresAt: number } | null = null;
  const tabTitles = new Map<string, string[]>(); // spreadsheetId -> tab titles
  const readyTabs = new Set<string>(); // "spreadsheetId|title" with verified headers

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
  const lastColumn = (target: SheetTarget) => String.fromCharCode(64 + target.headers.length);
  const valuesUrl = (target: SheetTarget, range: string) => `${API}/${target.spreadsheetId}/values/${encodeURIComponent(range)}`;

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
   * The monthly tab to write to, created (with the header row) when it does not exist.
   * An existing tab is matched loosely (SETIEMBRE = SEPTIEMBRE, case/spaces ignored).
   * An empty existing tab gets the header row; a tab with other headers is refused.
   */
  async function ensureTab(target: SheetTarget, wanted: string): Promise<string> {
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
    if (readyTabs.has(key)) return title;
    const data = await call<{ values?: unknown[][] }>(`${valuesUrl(target, `${quote(title)}!A1:${lastColumn(target)}10`)}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows = data.values ?? [];
    if (!rows.some((row) => row.some((cell) => String(cell ?? "").trim()))) {
      await call(`${valuesUrl(target, `${quote(title)}!A1:${lastColumn(target)}1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[...target.headers]] }) });
    } else if (findHeaderRow(rows, target.headers) < 0) {
      throw new SheetsError(`SHEETS_HEADER_MISMATCH: tab "${title}" does not have the headers ${target.headers.join(" | ")} in its first 10 rows`);
    }
    readyTabs.add(key);
    return title;
  }

  return {
    ensureTab,
    /** Appends one row under the table of the given monthly tab; returns the A1 range written. */
    async append(target: SheetTarget, tab: string, row: Cell[]): Promise<string> {
      const title = await ensureTab(target, tab);
      const result = await call<{ updates?: { updatedRange?: string } }>(
        `${valuesUrl(target, `${quote(title)}!A:${lastColumn(target)}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: [row] }) }
      );
      const range = result.updates?.updatedRange;
      if (!range) throw new SheetsError("SHEETS_APPEND_NO_RANGE: Google did not report where the row was written");
      return range;
    },
    async readRow(target: SheetTarget, range: string): Promise<unknown[] | null> {
      const data = await call<{ values?: unknown[][] }>(`${valuesUrl(target, range)}?valueRenderOption=UNFORMATTED_VALUE`);
      return data.values?.[0] ?? null;
    },
    /** Last row of the monthly tab whose operator / tour / guest columns match `key` (see tourRowKey); null if none. */
    async findTourRow(target: SheetTarget, tab: string, key: string): Promise<string | null> {
      const title = findTab(await listTabs(target.spreadsheetId), tab);
      if (!title) return null;
      const data = await call<{ values?: unknown[][] }>(`${valuesUrl(target, `${quote(title)}!A:${lastColumn(target)}`)}?valueRenderOption=UNFORMATTED_VALUE`);
      const rows = data.values ?? [];
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (tourRowKey(rows[index] as Cell[]) === key) return `${quote(title)}!A${index + 1}:${lastColumn(target)}${index + 1}`;
      }
      return null;
    },
    async update(target: SheetTarget, range: string, row: Cell[]): Promise<void> {
      await call(`${valuesUrl(target, range)}?valueInputOption=USER_ENTERED`, { method: "PUT", body: JSON.stringify({ values: [row] }) });
    }
  };
}

export type SheetsClient = ReturnType<typeof createSheetsClient>;
