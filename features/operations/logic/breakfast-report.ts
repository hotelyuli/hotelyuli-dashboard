import { sanitize } from "@/features/reports/logic/whatsapp-text";

export type BreakfastReportRow = { room: string | null; guest: string | null; pax: number; toGo: boolean; notes: string | null };

/** Reporte de desayuno text for Copiar and Imprimir, with the croissant header (written as an escape). */
export function formatBreakfastReport({ es, dateLabel, rows }: { es: boolean; dateLabel: string; rows: BreakfastReportRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.pax, 0);
  return [
    "\u{1F950} HOTEL YULI",
    es ? "Desayuno" : "Breakfast",
    dateLabel,
    "",
    ...rows.map((row) => `${row.room ?? "\u2014"} · ${row.guest ?? "\u2014"} · ${row.pax} pax${row.toGo ? ` · ${es ? "Para llevar" : "To go"}` : ""}${row.notes ? ` · ${row.notes}` : ""}`),
    "",
    `${es ? "Total" : "Total covers"}: ${total} pax`
  ].join("\n");
}

/** Same report for the WhatsApp link: no emoji (the croissant is dropped), Latin-1 only. */
export const formatBreakfastReportWhatsApp = (params: Parameters<typeof formatBreakfastReport>[0]) => sanitize(formatBreakfastReport(params));
