import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { formatBreakfastControl, formatBreakfastControlWhatsApp, latin1Only, summarizeBreakfastControl, type ControlEntry } from "@/features/operations/logic/breakfast-control";

// Characters built from code points so no editor or shell encoding can alter this file.
const CHECK = String.fromCodePoint(0x2705);
const PALM = String.fromCodePoint(0x1f334);
const WARNING = String.fromCodePoint(0x26a0, 0xfe0f);
const REPLACEMENT = String.fromCodePoint(0xfffd);

const D = "2026-10-03";
const entry = (over: Partial<ControlEntry>): ControlEntry => ({ room: "1", beds: false, sortOrder: 1, guestName: "Ana Mora", pax: 2, breakfastIncluded: false, breakfastPax: 0, toGo: false, toGoTime: null, notes: null, ...over });
const summary = summarizeBreakfastControl({ free: ["2", "8"], entries: [
  entry({ room: "1", sortOrder: 1, guestName: "Vargas, Sofía", pax: 3 }),
  entry({ room: "5", sortOrder: 5, guestName: `Pérez Ñúñez, José ${PALM}`, pax: 2, breakfastIncluded: true, breakfastPax: 2, toGo: true, toGoTime: "06:30:00", notes: `Sin gluten ${WARNING}` }),
  entry({ room: "14", sortOrder: 14, guestName: "Dvořák, Šárka", pax: 3, breakfastIncluded: true, breakfastPax: 2 }),
  entry({ room: "17", sortOrder: 17, guestName: "Haddad, Omar", pax: 2, toGo: true, notes: "Alergia a nueces" }),
  entry({ room: "20", beds: true, sortOrder: 20, guestName: "Tom", pax: 1, breakfastIncluded: true, breakfastPax: 1 }),
  entry({ room: "20", beds: true, sortOrder: 21, guestName: String.fromCodePoint(0x05d3, 0x05e0, 0x05d4), pax: 1 }) // Hebrew-only name
] });
const whatsapp = formatBreakfastControlWhatsApp({ date: D, summary });
const copy = formatBreakfastControl({ date: D, summary });
const aboveLatin1 = (text: string) => [...text].filter((ch) => ch.codePointAt(0)! > 0xff);

describe("WhatsApp text (wa.me link) is emoji-free", () => {
  it("has no characters above U+00FF at all", () => {
    expect(aboveLatin1(whatsapp)).toEqual([]);
    expect(encodeURIComponent(whatsapp)).not.toMatch(/%E2|%EF|%F0/); // no 3/4-byte UTF-8 sequences
  });

  it("uses WhatsApp bold and words instead of emoji", () => {
    expect(whatsapp.split("\n")).toEqual([
      "*Control de desayunos · sáb 03/10/2026*",
      "",
      "1 · Sofía Vargas · 3 pax",
      "5 · José Pérez Ñúñez · 2 pax · *DESAYUNO INCLUIDO* (para llevar 06:30) · ALERGIA/NOTA: Sin gluten",
      "14 · Sárka Dvorák · 3 pax · *DESAYUNO INCLUIDO* (2 pax)",
      "17 · Omar Haddad · 2 pax (para llevar) · ALERGIA/NOTA: Alergia a nueces",
      "20 camas · Tom · 2 pax · *DESAYUNO INCLUIDO* (1 pax)",
      "Libres: 2, 8",
      "",
      "*Total huéspedes en el hotel: 12 pax*",
      "*Con desayuno incluido: 5 pax (3 hab.)*"
    ]);
  });

  it("empty day", () => {
    const empty = formatBreakfastControlWhatsApp({ date: D, summary: summarizeBreakfastControl({ entries: [], free: [] }) });
    expect(empty).toContain("Sin huéspedes para el desayuno.");
    expect(empty).toContain("Libres: ninguna");
    expect(aboveLatin1(empty)).toEqual([]);
  });

  it("latin1Only keeps Spanish letters and drops emoji", () => {
    expect(latin1Only(`Ñandú ¿qué? ¡sí! ${PALM} Škoda`)).toBe("Ñandú ¿qué? ¡sí! Skoda");
  });
});

describe("Copiar texto keeps the emoji", () => {
  it("has the emoji and no U+FFFD", () => {
    expect(copy).toContain(`${CHECK} DESAYUNO INCLUIDO`);
    expect(copy).not.toContain(REPLACEMENT);
  });
});

describe("source files", () => {
  const root = path.resolve(__dirname, "../../..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|css|json|md)$/.test(name)) files.push(full);
    }
  };
  for (const dir of ["app", "features", "components", "lib", "tests", "docs", "supabase"]) walk(path.join(root, dir));

  it("contain no U+FFFD (bytes EF BF BD)", () => {
    const broken = files.filter((file) => readFileSync(file).includes(Buffer.from([0xef, 0xbf, 0xbd])));
    expect(broken).toEqual([]);
  });
});
