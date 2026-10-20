import { sanitize } from "@/features/reports/logic/whatsapp-text";
import { groupByStay, stayPax, totalPax, type PaxRow } from "@/features/operations/logic/pax";

/** The optional PaxRow fields let dorm beds of one booking merge into one line. */
export type BreakfastReportRow = { room: string | null; guest: string | null; pax: number; toGo: boolean; notes: string | null } & Partial<Omit<PaxRow, "pax" | "guestName">>;

const paxRow = (row: BreakfastReportRow): PaxRow => ({ ...row, dorm: row.dorm ?? false, guestName: row.guest });

/** Dorm beds of one booking become one line ("B1, B2") with the booking's covers counted once. */
export function mergeBreakfastReportRows(rows: BreakfastReportRow[]): BreakfastReportRow[] {
  return groupByStay(rows.map((row) => ({ ...paxRow(row), row }))).map((group) => {
    const notes = [...new Set(group.map(({ row }) => row.notes?.trim()).filter(Boolean))];
    return {
      ...group[0].row,
      room: group.map(({ row }) => row.room).filter(Boolean).join(", ") || null,
      pax: stayPax(group),
      toGo: group.some(({ row }) => row.toGo),
      notes: notes.length ? notes.join(" / ") : null
    };
  });
}

export const breakfastReportTotal = (rows: BreakfastReportRow[]) => totalPax(rows.map(paxRow));

/** Reporte de desayuno text for Copiar and Imprimir, with the croissant header (written as an escape). */
export function formatBreakfastReport({ es, dateLabel, rows }: { es: boolean; dateLabel: string; rows: BreakfastReportRow[] }) {
  const total = breakfastReportTotal(rows);
  return [
    "\u{1F950} HOTEL YULI",
    es ? "Desayuno" : "Breakfast",
    dateLabel,
    "",
    ...mergeBreakfastReportRows(rows).map((row) => `${row.room ?? "\u2014"} · ${row.guest ?? "\u2014"} · ${row.pax} pax${row.toGo ? ` · ${es ? "Para llevar" : "To go"}` : ""}${row.notes ? ` · ${row.notes}` : ""}`),
    "",
    `${es ? "Total" : "Total covers"}: ${total} pax`
  ].join("\n");
}

/** Same report for the WhatsApp link: no emoji (the croissant is dropped), Latin-1 only. */
export const formatBreakfastReportWhatsApp = (params: Parameters<typeof formatBreakfastReport>[0]) => sanitize(formatBreakfastReport(params));
