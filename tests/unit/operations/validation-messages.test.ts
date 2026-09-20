import { describe, expect, it } from "vitest";
import { formatRowWarning, translateRowWarning } from "@/features/operations/logic/validation-messages";

describe("translateRowWarning", () => {
  it("translates known validation codes into Spanish", () => {
    expect(translateRowWarning("MISSING_REQUIRED_FIELDS")).toMatch(/habitación|fecha|estadía/i);
    expect(translateRowWarning("INVALID_ARRIVAL_DATE")).toMatch(/llegada/i);
    expect(translateRowWarning("INVALID_DEPARTURE_DATE")).toMatch(/salida/i);
    expect(translateRowWarning("INVALID_LOS")).toMatch(/noches/i);
    expect(translateRowWarning("UNRESOLVED_ROOM")).toMatch(/habitación/i);
  });

  it("translates parameterized codes without leaking anything but the room token", () => {
    expect(translateRowWarning("UNMATCHED_ROOM_TOKEN:Suite Presidencial")).toBe('No se reconoce la habitación "Suite Presidencial".');
    expect(translateRowWarning("UNKNOWN_ROOM_CODE:99")).toBe('La habitación "99" no existe en este hotel.');
  });

  it("falls back to a generic Spanish message for unknown codes", () => {
    expect(translateRowWarning("SOMETHING_NEW")).toBe("Fila no reconocida.");
  });
});

describe("formatRowWarning", () => {
  it("prefixes the message with a 1-indexed row number", () => {
    expect(formatRowWarning(0, "UNRESOLVED_ROOM")).toMatch(/^Fila 1: /);
    expect(formatRowWarning(4, "UNRESOLVED_ROOM")).toMatch(/^Fila 5: /);
  });
});
