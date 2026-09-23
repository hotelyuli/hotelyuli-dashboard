import { describe, expect, it, vi } from "vitest";
import { unstable_rethrow } from "next/navigation";
import { runAction } from "@/lib/action-result";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

describe("runAction", () => {
  it("returns ok when the action succeeds", async () => {
    await expect(runAction("test", async () => {})).resolves.toEqual({ ok: true });
  });

  it("returns the real error message instead of a generic failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAction("test", async () => {
      throw new Error('LEDGER_LOAD_FAILED: column income_entries.source_type does not exist');
    });
    expect(result).toEqual({ ok: false, error: "LEDGER_LOAD_FAILED: column income_entries.source_type does not exist" });
    expect(console.error).toHaveBeenCalled();
  });

  it("lets Next.js redirect/notFound errors through first", async () => {
    vi.mocked(unstable_rethrow).mockImplementationOnce((error) => { throw error; });
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(runAction("test", async () => { throw redirect; })).rejects.toBe(redirect);
  });
});
