import { describe, it, expect } from "vitest";
import { fitImageToPage } from "@/features/reports/logic/pdf-fit";

describe("fitImageToPage (A4, 10 mm margins)", () => {
  it("fills the printable width for a wide, short card", () => {
    const fit = fitImageToPage(1200, 600);
    expect(fit.width).toBeCloseTo(190);
    expect(fit.height).toBeCloseTo(95);
    expect(fit).toMatchObject({ x: 10, y: 10 });
  });
  it("shrinks a tall card to fit one page and centers it", () => {
    const fit = fitImageToPage(1000, 3000);
    expect(fit.height).toBeCloseTo(277);
    expect(fit.width).toBeCloseTo(277 / 3);
    expect(fit.x).toBeCloseTo((210 - 277 / 3) / 2);
  });
});
