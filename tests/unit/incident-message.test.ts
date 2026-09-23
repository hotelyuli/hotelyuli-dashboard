import { describe, expect, it } from "vitest";
import { incidentWhatsAppText, whatsappShareUrl } from "@/features/records/logic/incident-message";
import { otherRecipientPhone } from "@/features/contacts/SupplierMessage";

describe("incident WhatsApp message", () => {
  it("builds the Spanish message for any category", () => {
    expect(incidentWhatsAppText({ event_time: "10:15:00", category: "guest_complaint", room_area: "Hab 9", description: " Ruido de la calle ", status: "follow_up" }))
      .toBe("🏨 Hotel Yuli — Incidencia\nHabitación: Hab 9 · Queja de huésped\nRuido de la calle\nHora: 10:15 · Estado: Seguimiento");
  });

  it("shows — when there is no room/area and translates every status", () => {
    const text = incidentWhatsAppText({ event_time: "08:00:00", category: "security", room_area: null, description: "Portón abierto", status: "completed" });
    expect(text).toContain("Habitación: — · Seguridad");
    expect(text).toContain("Estado: Completado");
  });

  it("opens WhatsApp without a number so the employee picks the recipient", () => {
    const url = whatsappShareUrl("🏨 Hotel Yuli — Incidencia\nHab 5");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe("🏨 Hotel Yuli — Incidencia\nHab 5");
  });
});

describe("supplier picker: Otro", () => {
  it("accepts a number with country code and rejects anything else", () => {
    expect(otherRecipientPhone("+506 8888-7777")).toBe("50688887777");
    expect(otherRecipientPhone("8888")).toBeNull();
    expect(otherRecipientPhone("abc")).toBeNull();
  });
});
