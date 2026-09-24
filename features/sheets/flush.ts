import { incomeRow, shouldExportIncome, tourRow, tourRowKey, INCOME_HEADERS, TOURS_HEADERS, type Cell, type IncomeEnrichment, type IncomeRecord, type TourRecord } from "./rows";
import type { SheetTarget } from "./google";

// Flushes google_sheets_outbox to the two spreadsheets. Storage and Google are
// injected so the flow is unit-testable; production wiring is in export.ts.

export type OutboxItem = {
  id: string;
  entity_type: "tour" | "income";
  entity_id: string;
  attempt_count: number;
  sheet_range: string | null;
  sheet_values: Cell[] | null;
};

export type OutboxStore = {
  /** Atomically claims up to `limit` items (pending, failed with attempts left, or stale sending). */
  claim(limit: number): Promise<OutboxItem[]>;
  loadTour(id: string): Promise<TourRecord | null>;
  loadIncome(id: string): Promise<{ income: IncomeRecord; enrichment: IncomeEnrichment } | null>;
  /** Saved unconditionally, so a re-queued tour updates this row instead of appending a duplicate. */
  saveLocation(id: string, range: string, values: Cell[]): Promise<void>;
  markSent(id: string): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markFailed(id: string, error: string, attempts: number): Promise<void>;
};

export type SheetsWriter = {
  append(target: SheetTarget, row: Cell[]): Promise<string>;
  readRow(target: SheetTarget, range: string): Promise<unknown[] | null>;
  findTourRow(target: SheetTarget, key: string): Promise<string | null>;
  update(target: SheetTarget, range: string, row: Cell[]): Promise<void>;
};

export type SheetsTargets = { tours: SheetTarget; income: SheetTarget };
export type FlushResult = { claimed: number; sent: number; skipped: number; failed: number; errors: string[] };

export const MAX_ATTEMPTS = 5;

export function targetsFromEnv(env: NodeJS.ProcessEnv = process.env): SheetsTargets {
  const tours = env.GOOGLE_SHEETS_TOURS_ID?.trim();
  const income = env.GOOGLE_SHEETS_INCOME_ID?.trim();
  if (!tours || !income) throw new Error("SHEETS_NOT_CONFIGURED: GOOGLE_SHEETS_TOURS_ID and GOOGLE_SHEETS_INCOME_ID are required");
  return {
    tours: { spreadsheetId: tours, tab: env.GOOGLE_SHEETS_TOURS_TAB, headers: TOURS_HEADERS },
    income: { spreadsheetId: income, tab: env.GOOGLE_SHEETS_INCOME_TAB, headers: INCOME_HEADERS }
  };
}

/** A tour row is updated in place when we know where it is (and it still holds that tour); otherwise appended. */
async function writeTour(item: OutboxItem, row: Cell[], sheets: SheetsWriter, target: SheetTarget): Promise<string> {
  if (item.sheet_range && item.sheet_values) {
    const expectedKey = tourRowKey(item.sheet_values);
    const current = await sheets.readRow(target, item.sheet_range);
    const range = current && tourRowKey(current as Cell[]) === expectedKey
      ? item.sheet_range
      : await sheets.findTourRow(target, expectedKey); // rows were sorted / moved by hand
    if (range) {
      await sheets.update(target, range, row);
      return range;
    }
  }
  return sheets.append(target, row);
}

export async function flushSheetsOutbox(deps: { store: OutboxStore; sheets: SheetsWriter; targets: SheetsTargets; limit?: number }): Promise<FlushResult> {
  const { store, sheets, targets } = deps;
  const items = await store.claim(deps.limit ?? 25);
  const result: FlushResult = { claimed: items.length, sent: 0, skipped: 0, failed: 0, errors: [] };

  for (const item of items) {
    try {
      if (item.entity_type === "tour") {
        const tour = await store.loadTour(item.entity_id);
        if (!tour) { await store.markSkipped(item.id, "SKIPPED: tour no longer exists"); result.skipped += 1; continue; }
        const row = tourRow(tour);
        const range = await writeTour(item, row, sheets, targets.tours);
        await store.saveLocation(item.id, range, row);
      } else {
        const loaded = await store.loadIncome(item.entity_id);
        if (!loaded) { await store.markSkipped(item.id, "SKIPPED: income entry no longer exists"); result.skipped += 1; continue; }
        if (!shouldExportIncome(loaded.income)) { await store.markSkipped(item.id, "SKIPPED: not settled (unpaid)"); result.skipped += 1; continue; }
        const row = incomeRow(loaded.income, loaded.enrichment);
        // Income is append-only: a queue item is written once.
        const range = item.sheet_range ?? await sheets.append(targets.income, row);
        await store.saveLocation(item.id, range, row);
      }
      await store.markSent(item.id);
      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.markFailed(item.id, message, item.attempt_count + 1);
      result.failed += 1;
      result.errors.push(`${item.entity_type} ${item.entity_id}: ${message}`);
    }
  }
  return result;
}
