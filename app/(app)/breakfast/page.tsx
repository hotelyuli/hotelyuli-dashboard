import Link from "next/link";
import { SaveReportButton } from "@/features/reports/components/SaveReportButton";
import { ReportHistory } from "@/features/reports/components/ReportHistory";
import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { MessageActions } from "@/features/reports/components/MessageActions";
import { breakfastReportTotal, formatBreakfastReport, formatBreakfastReportWhatsApp, mergeBreakfastReportRows } from "@/features/operations/logic/breakfast-report";
import type { Locale } from "@/lib/i18n";
import { reservationReferences } from "@/features/operations/services/reservation-references";

export const metadata = { title: "Breakfast" };

export default async function BreakfastPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const [{ data: operations }, { data: rooms }] = await Promise.all([
    supabase.from("daily_operations").select("room_id, reservation_id, guest_name, arrival_date, departure_date, breakfast_pax, breakfast_to_go, breakfast_notes").eq("hotel_id", hotelId).eq("operation_date", operationDate).eq("breakfast_status", "included"),
    supabase.from("rooms").select("id, display_name, sort_order, unit_type").eq("hotel_id", hotelId).order("sort_order", { ascending: true })
  ]);
  const roomById = new Map((rooms ?? []).map((room) => [room.id, room]));
  const rows = (operations ?? []).sort((a, b) => (roomById.get(a.room_id)?.sort_order ?? 999) - (roomById.get(b.room_id)?.sort_order ?? 999));
  const references = await reservationReferences(supabase, hotelId, rows.map((row) => row.reservation_id));
  const es = locale === "es";
  const dateLabel = new Intl.DateTimeFormat(es ? "es-CR" : "en-US", { timeZone: "America/Costa_Rica", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const reportParams = { es, dateLabel, rows: rows.map((row) => ({ room: roomById.get(row.room_id)?.display_name ?? null, guest: row.guest_name, pax: row.breakfast_pax, toGo: row.breakfast_to_go, notes: row.breakfast_notes, dorm: roomById.get(row.room_id)?.unit_type === "bunk", reservationId: row.reservation_id, reference: row.reservation_id ? references.get(row.reservation_id) ?? null : null, arrivalDate: row.arrival_date, departureDate: row.departure_date })) };
  const total = breakfastReportTotal(reportParams.rows);
  const tableRows = mergeBreakfastReportRows(reportParams.rows);
  const message = formatBreakfastReport(reportParams);
  const whatsappMessage = formatBreakfastReportWhatsApp(reportParams);

  return (
    <main className="dashboard-page">
      <div className="page-heading"><div><p className="eyebrow">{es ? "RESTAURANTE" : "RESTAURANT"}</p><h1>{es ? "Reporte de desayuno" : "Breakfast report"}</h1><p>{es ? `${total} desayunos incluidos para hoy.` : `${total} included breakfast covers today.`}</p></div><div className="message-actions"><MessageActions text={message} whatsappText={whatsappMessage} locale={locale} /><Link className="secondary-button" href="/breakfast/control">{es ? "Lista para restaurante" : "Restaurant list"}</Link></div></div>
      <div className="board-table-wrap">
        <table className="board-table"><thead><tr><th>{es ? "Habitación" : "Room"}</th><th>{es ? "Huésped" : "Guest"}</th><th>Pax</th><th>{es ? "Para llevar" : "To go"}</th><th>{es ? "Notas" : "Notes"}</th></tr></thead>
          <tbody>{tableRows.length ? tableRows.map((row, index) => <tr key={`${row.room}-${index}`}><td><strong>{row.room ?? "—"}</strong></td><td>{row.guest ?? "—"}</td><td>{row.pax}</td><td>{row.toGo ? (es ? "Sí" : "Yes") : "—"}</td><td>{row.notes ?? "—"}</td></tr>) : <tr><td colSpan={5} className="empty-table-cell">{es ? "No hay desayunos incluidos registrados para hoy." : "No included breakfasts are registered for today."}</td></tr>}</tbody>
        </table>
      </div>
      <section className="message-summary"><h2>{es ? "Lista para WhatsApp" : "WhatsApp summary"}</h2><pre>{message}</pre></section>
      <SaveReportButton kind="breakfast" date={operationDate} locale={locale} text={message} />
      <ReportHistory kind="breakfast" locale={locale} />
    </main>
  );
}
