import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import { MainNav } from "@/components/MainNav";
import { mainNavItems } from "@/components/nav-items";
import { ROLES } from "@/features/auth/logic/permissions";
import { REPLY_GENERATOR_URL } from "@/lib/external-links";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
afterEach(cleanup);

const hasReplyGenerator = (role: string, active = true) => mainNavItems("es", { role, active }).some((item) => item.href === REPLY_GENERATOR_URL);

describe("Generador de respuestas menu item", () => {
  it("only owner and manager see it", () => {
    expect(ROLES.filter((role) => hasReplyGenerator(role))).toEqual(["owner", "manager"]);
  });

  it("is hidden for an inactive profile or no profile", () => {
    expect(hasReplyGenerator("owner", false)).toBe(false);
    expect(mainNavItems("es", null).some((item) => item.external)).toBe(false);
  });

  it("sits right after Proveedores, labelled in Spanish and English", () => {
    const es = mainNavItems("es", { role: "manager", active: true });
    expect(es.slice(-2).map((item) => item.label)).toEqual(["Proveedores", "Generador de respuestas"]);
    expect(mainNavItems("en", { role: "owner", active: true }).at(-1)?.label).toBe("Reply generator");
  });

  it("opens the reply generator in a new tab with an external-link icon, never in an iframe", () => {
    const { container } = render(<MainNav items={mainNavItems("es", { role: "owner", active: true })} />);
    const link = screen.getByRole("link", { name: "Generador de respuestas" });
    expect(link).toHaveAttribute("href", "https://reply-generator.netlify.app");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelector(".external-icon")).not.toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    // Internal items stay same-tab.
    expect(screen.getByRole("link", { name: "Proveedores" })).not.toHaveAttribute("target");
  });

  it("the URL lives in one constant", () => {
    const root = path.resolve(__dirname, "../..");
    for (const file of ["components/MainNav.tsx", "components/nav-items.ts", "app/(app)/layout.tsx", "lib/i18n.ts"]) {
      expect(readFileSync(path.join(root, file), "utf8")).not.toContain("reply-generator.netlify.app");
    }
  });
});
