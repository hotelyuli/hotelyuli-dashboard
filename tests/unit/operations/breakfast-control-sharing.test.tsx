import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import { BreakfastControlActions } from "@/features/operations/components/BreakfastControlActions";
import { breakfastPdfName, breakfastPngName, shareOrDownload } from "@/features/reports/logic/share-file";

const pdf = () => new File(["%PDF"], breakfastPdfName("2026-10-03"), { type: "application/pdf" });

describe("breakfast PDF sharing", () => {
  it("names the files desayunos-YYYY-MM-DD.pdf / .png", () => {
    expect(breakfastPdfName("2026-10-03")).toBe("desayunos-2026-10-03.pdf");
    expect(breakfastPngName("2026-10-03")).toBe("desayunos-2026-10-03.png");
  });

  it("shares the PDF file itself when the phone can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const file = pdf();
    expect(await shareOrDownload(file, { share, canShare: () => true }, download)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file], title: "desayunos-2026-10-03.pdf" });
    expect(share.mock.calls[0][0].files[0].type).toBe("application/pdf");
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    ["no Web Share", undefined],
    ["share without file support", { share: vi.fn(), canShare: () => false }],
    ["share without canShare", { share: vi.fn() }]
  ])("falls back to downloading: %s", async (_label, nav) => {
    const download = vi.fn();
    expect(await shareOrDownload(pdf(), nav, download)).toBe("downloaded");
    expect(download).toHaveBeenCalledOnce();
  });

  it("does nothing when the user closes the share sheet", async () => {
    const download = vi.fn();
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("cancel"), { name: "AbortError" }));
    expect(await shareOrDownload(pdf(), { share, canShare: () => true }, download)).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads if sharing fails for another reason", async () => {
    const download = vi.fn();
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    expect(await shareOrDownload(pdf(), { share, canShare: () => true }, download)).toBe("downloaded");
    expect(download).toHaveBeenCalledOnce();
  });
});

describe("BreakfastControlActions", () => {
  const original = window.matchMedia;
  const pointer = (coarse: boolean) => { window.matchMedia = ((query: string) => ({ matches: coarse, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia; };
  const labels = () => screen.getAllByRole("button").concat(screen.getAllByRole("link")).map((el) => el.textContent);
  const canShareFiles = (supported: boolean | undefined) => { Object.defineProperty(navigator, "canShare", { configurable: true, value: supported === undefined ? undefined : (data: ShareData) => supported && !!data.files?.[0] && data.files[0].type === "application/pdf" }); };
  afterEach(() => { cleanup(); window.matchMedia = original; canShareFiles(undefined); });

  it("phones that can share files: Descargar PDF · Compartir · Imprimir · Copiar imagen · Copiar texto · WhatsApp texto", () => {
    pointer(true);
    canShareFiles(true);
    render(<BreakfastControlActions targetId="card" date="2026-10-03" text="Control" locale="es" />);
    expect(labels()).toEqual(["Descargar PDF", "Compartir", "Imprimir", "Copiar imagen", "Copiar texto", "WhatsApp texto"]);
    expect(screen.getByText("Descargar PDF")).toHaveClass("primary-button");
    expect(screen.getByText("WhatsApp texto").closest("a")).toHaveAttribute("href", "https://wa.me/?text=Control");
  });

  it("phones that cannot share files: no Compartir", () => {
    pointer(true);
    canShareFiles(false);
    render(<BreakfastControlActions targetId="card" date="2026-10-03" text="Control" locale="es" />);
    expect(labels()).toEqual(["Descargar PDF", "Imprimir", "Copiar imagen", "Copiar texto", "WhatsApp texto"]);
  });

  it("desktop: no Compartir even if the browser can share, and no save button", () => {
    canShareFiles(true);
    pointer(false);
    render(<BreakfastControlActions targetId="card" date="2026-10-03" text="Control" locale="es" />);
    expect(labels()).toEqual(["Descargar PDF", "Imprimir", "Copiar imagen", "Copiar texto", "WhatsApp texto"]);
    expect(screen.queryByText(/Guardar/)).toBeNull();
  });
});

describe("/breakfast/control never writes to the database", () => {
  const root = path.resolve(__dirname, "../../..");
  const files = [
    "app/(app)/breakfast/control/page.tsx",
    "features/operations/components/BreakfastControlActions.tsx",
    "features/operations/components/BreakfastControlCard.tsx",
    "features/operations/logic/breakfast-control.ts",
    "features/reports/logic/share-file.ts",
    "features/reports/logic/pdf-fit.ts"
  ];
  it.each(files)("%s has no writes, RPCs, server actions or save buttons", (file) => {
    const source = readFileSync(path.join(root, file), "utf8");
    // Table writes only; a Set's .delete() in the pure logic is not a database call.
    expect(source).not.toMatch(/\.(insert|update|upsert)\(|\.from\([^)]*\)\s*\.delete\(|\.rpc\(|["']use server["']|SaveReportButton|\/actions["']|Guardar/);
  });
  it("the page only reads", () => {
    const source = readFileSync(path.join(root, files[0]), "utf8");
    expect(source.match(/supabase\.from\("[a-z_]+"\)\.(\w+)/g)?.map((call) => call.split(".").pop())).toEqual(["select", "select", "select", "select"]);
  });
});
