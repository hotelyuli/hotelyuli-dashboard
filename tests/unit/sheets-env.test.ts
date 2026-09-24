import { describe, expect, it } from "vitest";
import { missingSheetsEnv, sheetsExportConfigured } from "@/features/sheets/export";

describe("Sheets export configuration", () => {
  const full = { GOOGLE_SERVICE_ACCOUNT_JSON: "eyJ9", GOOGLE_SHEETS_TOURS_ID: "t", GOOGLE_SHEETS_INCOME_ID: "i", SUPABASE_SERVICE_ROLE_KEY: "k", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" };
  it("reports the names of missing (or blank) env vars, never values", () => {
    expect(missingSheetsEnv({ ...full, GOOGLE_SHEETS_TOURS_ID: " ", SUPABASE_SERVICE_ROLE_KEY: undefined } as unknown as NodeJS.ProcessEnv)).toEqual(["GOOGLE_SHEETS_TOURS_ID", "SUPABASE_SERVICE_ROLE_KEY"]);
    expect(sheetsExportConfigured(full as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
