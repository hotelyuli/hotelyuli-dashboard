import { sanitize } from "@/features/reports/logic/whatsapp-text";

export type HousekeepingGroups = { priority: string[]; vacant_after_departure: string[]; remains_occupied: string[] };

/** Limpieza list for Copiar, Imprimir and saved reports, with the broom and colored-dot headings (written as escapes). */
export function formatHousekeepingReport({ es, dateLabel, groups }: { es: boolean; dateLabel: string; groups: HousekeepingGroups }) {
  const list = (rooms: string[]) => rooms.join("\n") || "—";
  return [
    "\u{1F9F9} HOTEL YULI",
    es ? "Limpieza" : "Housekeeping",
    dateLabel,
    "",
    `\u{1F534} ${es ? "PRIORIDAD" : "PRIORITY"}\n(${es ? "Salida + Entrada" : "Departure + Arrival"})\n${list(groups.priority)}`,
    "",
    `\u{1F7E1} ${es ? "QUEDAN VACÍAS" : "VACANT AFTER DEPARTURE"}\n${list(groups.vacant_after_departure)}`,
    "",
    `\u{1F7E2} ${es ? "PERMANECEN OCUPADAS" : "REMAINS OCCUPIED"}\n${list(groups.remains_occupied)}`
  ].join("\n");
}

/** Same list for the WhatsApp link: no emoji (headings stay as plain text), Latin-1 only. */
export const formatHousekeepingReportWhatsApp = (params: Parameters<typeof formatHousekeepingReport>[0]) => sanitize(formatHousekeepingReport(params));
