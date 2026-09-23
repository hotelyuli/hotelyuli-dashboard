import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerEvent } from "@/features/records/actions";
import { requireSession } from "@/features/auth/logic/guards";

vi.mock("@/features/auth/logic/guards", () => ({ requireSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const CLIENT_ID = "55555555-5555-4555-8555-555555555555";

function makeSupabase(insertError: { code: string } | null) {
  const inserted: { table: string; row: Record<string, unknown> }[] = [];
  return {
    inserted,
    from(table: string) {
      if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: { hotel_id: "hotel-1", role: "reception", active: true, full_name: "Grettel" }, error: null }) }) }) };
      return { insert: async (row: Record<string, unknown>) => { inserted.push({ table, row }); return { error: insertError }; } };
    }
  };
}

function eventForm() {
  const form = new FormData();
  Object.entries({ clientId: CLIENT_ID, eventTime: "10:00", category: "maintenance", roomArea: "Hab 5", description: "AC leaking", actionTaken: "", status: "follow_up", priority: "high", requiresFollowUp: "false" }).forEach(([key, value]) => form.set(key, value));
  return form;
}

describe("registerEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts the incident under the form's client id and leaves the task to the database trigger", async () => {
    const supabase = makeSupabase(null);
    vi.mocked(requireSession).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);
    await registerEvent(eventForm());
    expect(supabase.inserted.map((entry) => entry.table)).toEqual(["shift_events"]);
    expect(supabase.inserted[0].row).toMatchObject({ id: CLIENT_ID, status: "follow_up" });
  });

  it("a retried submit of the same incident (primary key conflict) succeeds without a second incident", async () => {
    const supabase = makeSupabase({ code: "23505" });
    vi.mocked(requireSession).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);
    await expect(registerEvent(eventForm())).resolves.toBeUndefined();
  });

  it("still reports real failures", async () => {
    const supabase = makeSupabase({ code: "42501" });
    vi.mocked(requireSession).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);
    await expect(registerEvent(eventForm())).rejects.toThrow("SAVE_FAILED");
  });
});
