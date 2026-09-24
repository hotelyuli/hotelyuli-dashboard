import { createSign } from "node:crypto";
import { findHeaderRow, tourRowKey, type Cell } from "./rows";

// Server-only Google Sheets client: service-account JWT (RS256) -> OAuth token ->
// Sheets REST v4. No SDK dependency; nothing here is imported by client code.

export type ServiceAccount = { client_email: string; private_key: string };
export type SheetTarget = { spreadsheetId: string; tab?: string; headers: readonly string[] };

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
  const titles = new Map<string, string>();
  const checkedHeaders = new Set<string>();

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

  /** Tab to write to: the configured one, else the spreadsheet's first tab. */
  async function tabTitle(target: SheetTarget): Promise<string> {
    if (target.tab?.trim()) return target.tab.trim();
    const cached = titles.get(target.spreadsheetId);
    if (cached) return cached;
    const meta = await call<{ sheets?: { properties?: { title?: string } }[] }>(`${API}/${target.spreadsheetId}?fields=sheets.properties.title`);
    const title = meta.sheets?.[0]?.properties?.title;
    if (!title) throw new SheetsError("SHEETS_NO_TAB: the spreadsheet has no tabs");
    titles.set(target.spreadsheetId, title);
    return title;
  }

  const quote = (title: string) => `'${title.replace(/'/g, "''")}'`;
  const lastColumn = (target: SheetTarget) => String.fromCharCode(64 + target.headers.length);
  const valuesUrl = (target: SheetTarget, range: string) => `${API}/${target.spreadsheetId}/values/${encodeURIComponent(range)}`;

  /** Refuses to write unless the tab's header row matches the expected columns exactly. */
  async function ensureHeaders(target: SheetTarget): Promise<string> {
    const title = await tabTitle(target);
    const key = `${target.spreadsheetId}|${title}`;
    if (checkedHeaders.has(key)) return title;
    const data = await call<{ values?: unknown[][] }>(`${valuesUrl(target, `${quote(title)}!A1:${lastColumn(target)}10`)}?valueRenderOption=UNFORMATTED_VALUE`);
    if (findHeaderRow(data.values ?? [], target.headers) < 0) {
      throw new SheetsError(`SHEETS_HEADER_MISMATCH: tab "${title}" does not have the headers ${target.headers.join(" | ")} in its first 10 rows (set the *_TAB env var if the data is on another tab)`);
    }
    checkedHeaders.add(key);
    return title;
  }

  return {
    ensureHeaders,
    /** Appends one row under the table; returns the A1 range written (e.g. 'Sheet1'!A120:I120). */
    async append(target: SheetTarget, row: Cell[]): Promise<string> {
      const title = await ensureHeaders(target);
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
    /** Last row whose operator / tour / guest columns match `key` (see tourRowKey); null if none. */
    async findTourRow(target: SheetTarget, key: string): Promise<string | null> {
      const title = await ensureHeaders(target);
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
