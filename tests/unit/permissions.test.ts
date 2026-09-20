import { describe, expect, it } from "vitest";
import { can } from "@/features/auth/logic/permissions";

describe("permission matrix", () => {
  it("allows only owners to administer staff", () => {
    expect(can("owner", "staff:manage")).toBe(true);
    expect(can("manager", "staff:manage")).toBe(false);
    expect(can("reception", "staff:manage")).toBe(false);
  });

  it("keeps read-only sessions out of mutations", () => {
    expect(can("read_only", "dashboard:view")).toBe(true);
    expect(can("read_only", "operations:write")).toBe(false);
  });

  it("allows managers to inspect audit history", () => {
    expect(can("manager", "audit:view")).toBe(true);
    expect(can("reception", "audit:view")).toBe(false);
  });
});
