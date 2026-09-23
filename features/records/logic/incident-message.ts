import { incidentStatusLabel } from "./labels";

const CATEGORY_ES: Record<string, string> = {
  arriving: "Llegada",
  departure: "Salida",
  guest_request: "Solicitud de huésped",
  guest_complaint: "Queja de huésped",
  maintenance: "Mantenimiento",
  security: "Seguridad",
  other: "Otro"
};

export function incidentCategoryLabel(category: string): string {
  return CATEGORY_ES[category] ?? category.replaceAll("_", " ");
}

type IncidentForMessage = { event_time: string; category: string; room_area: string | null; description: string; status: string };

/** Spanish WhatsApp text for any incident; the employee picks the recipient in WhatsApp. */
export function incidentWhatsAppText(event: IncidentForMessage): string {
  return [
    "🏨 Hotel Yuli — Incidencia",
    `Habitación: ${event.room_area?.trim() || "—"} · ${incidentCategoryLabel(event.category)}`,
    event.description.trim(),
    `Hora: ${event.event_time.slice(0, 5)} · Estado: ${incidentStatusLabel(event.status, "es")}`
  ].join("\n");
}

/** wa.me link with no phone number: WhatsApp opens its contact picker. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
