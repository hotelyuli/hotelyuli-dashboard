import { describe, expect, it, vi } from "vitest";
import { commitCsvImport, type ImportState } from "@/features/csv-import/actions";
import { requireSession } from "@/features/auth/logic/guards";
import { materializeAfterImport } from "@/features/operations/services/materialize-after-import";

vi.mock("@/features/auth/logic/guards", () => ({ requireSession: vi.fn() }));
vi.mock("@/features/operations/services/materialize-after-import", () => ({
  materializeAfterImport: vi.fn().mockResolvedValue({ warnings: [] })
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const profile = { hotel_id: "hotel-1", role: "reception", active: true };

function makeSupabase(
  insertResult: { data: { id: string } | null; error: { code?: string } | null },
  existingImportResult: { data: { id: string } | null; error: { code?: string } | null } = { data: null, error: null }
) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }) };
      }
      if (table === "reservation_imports") {
        return {
          insert: () => ({ select: () => ({ single: async () => insertResult }) }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ single: async () => existingImportResult })
                })
              })
            })
          })
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

function payloadFormData() {
  const data = new FormData();
  data.set(
    "payload",
    JSON.stringify({ fileType: "check_in", fileName: "checkins.csv", headers: ["Guest"], rows: [{ Guest: "Ana" }] })
  );
  return data;
}

const initialState: ImportState = { status: "idle" };

describe("commitCsvImport duplicate handling", () => {
  it("saves a fresh import", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      supabase: makeSupabase({ data: { id: "import-1" }, error: null }) as never,
      user: { id: "user-1" } as never
    });
    const result = await commitCsvImport(initialState, payloadFormData());
    expect(result).toEqual({ status: "success", message: "SAVED" });
  });

  it("re-materializes a duplicate import instead of silently skipping it", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      supabase: makeSupabase(
        { data: null, error: { code: "23505" } },
        { data: { id: "existing-import" }, error: null }
      ) as never,
      user: { id: "user-1" } as never
    });
    const result = await commitCsvImport(initialState, payloadFormData());
    expect(result).toEqual({ status: "success", message: "DUPLICATE" });
    expect(materializeAfterImport).toHaveBeenCalledWith(expect.objectContaining({ sourceImportId: "existing-import" }));
  });

  it("surfaces per-row validation failures as Spanish messages instead of silently dropping them", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      supabase: makeSupabase({ data: { id: "import-2" }, error: null }) as never,
      user: { id: "user-1" } as never
    });
    vi.mocked(materializeAfterImport).mockResolvedValueOnce({
      warnings: [{ row: 0, message: "MISSING_REQUIRED_FIELDS" }, { row: 2, message: "UNRESOLVED_ROOM" }]
    });
    const result = await commitCsvImport(initialState, payloadFormData());
    expect(result.status).toBe("success");
    expect(result.message).toBe("SAVED_WITH_ROW_ERRORS");
    expect(result.rowErrors).toEqual([
      "Fila 1: Faltan columnas obligatorias (habitación, fecha o noches de estadía).",
      "Fila 3: No se reconoce la habitación indicada."
    ]);
  });
});
