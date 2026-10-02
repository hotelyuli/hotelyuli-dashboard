import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { sanitize } from "@/features/reports/logic/whatsapp-text";
import { formatBreakfastReport, formatBreakfastReportWhatsApp } from "@/features/operations/logic/breakfast-report";

const aboveLatin1 = (text: string) => [...text].filter((ch) => ch.codePointAt(0)! > 0xff);

describe("sanitize (WhatsApp link text)", () => {
  it("strips U+FFFD", () => {
    expect(sanitize("\uFFFD HOTEL YULI")).toBe("HOTEL YULI");
  });

  it("strips emoji and lone surrogates", () => {
    expect(sanitize("\u{1F950} HOTEL YULI")).toBe("HOTEL YULI");
    expect(sanitize("a\uD83Eb\uDD50c")).toBe("abc"); // high and low surrogate, each alone
  });

  it("keeps Spanish letters, the middle dot and line breaks; plain dashes and quotes", () => {
    expect(sanitize("Habitación 5 · Ñandú ¿sí?\n\u2014 \u201CVIP\u201D \u2026")).toBe("Habitación 5 · Ñandú ¿sí?\n- \"VIP\" ...");
  });
});

describe("Reporte de desayuno message", () => {
  const params = { es: true, dateLabel: "sábado, 3 de octubre de 2026", rows: [
    { room: "Habitación 4", guest: "Bruno San Pedro", pax: 2, toGo: false, notes: null },
    { room: null, guest: null, pax: 1, toGo: true, notes: "Sin gluten \u26A0\uFE0F" }
  ] };

  it("copy/print version keeps the croissant", () => {
    const text = formatBreakfastReport(params);
    expect(text.split("\n")[0]).toBe("\u{1F950} HOTEL YULI");
    expect(text).not.toContain("\uFFFD");
  });

  it("WhatsApp version drops it and has nothing above U+00FF", () => {
    const text = formatBreakfastReportWhatsApp(params);
    expect(text.split("\n")).toEqual([
      "HOTEL YULI",
      "Desayuno",
      "sábado, 3 de octubre de 2026",
      "",
      "Habitación 4 · Bruno San Pedro · 2 pax",
      "- · - · 1 pax · Para llevar · Sin gluten",
      "",
      "Total: 3 pax"
    ]);
    expect(aboveLatin1(text)).toEqual([]);
  });
});

describe("source files under app/, features/, components/, lib/", () => {
  const root = path.resolve(__dirname, "../..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|css|md)$/.test(name)) files.push(full);
    }
  };
  for (const dir of ["app", "features", "components", "lib"]) walk(path.join(root, dir));

  it("contain no U+FFFD (bytes EF BF BD)", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((file) => readFileSync(file).includes(Buffer.from([0xef, 0xbf, 0xbd])))).toEqual([]);
  });
});
