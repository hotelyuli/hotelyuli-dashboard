import { SaveReportButton } from "@/features/reports/components/SaveReportButton";
import { ReportHistory } from "@/features/reports/components/ReportHistory";
import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { MessageActions } from "@/features/reports/components/MessageActions";
import { CleaningControls } from "@/features/operations/components/CleaningControls";
import type { Locale } from "@/lib/i18n";
import { bedSetupLabel, supportsBedSetup } from "@/features/operations/logic/room-setup";

export const metadata = { title: "Housekeeping" };

export default async function HousekeepingPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const [{ data: rooms }, { data: operations }] = await Promise.all([
    supabase.from("rooms").select("id, display_name, sort_order, unit_code").eq("hotel_id", hotelId).eq("active", true).order("sort_order", { ascending: true }),
    supabase.from("daily_operations").select("id, room_id, operational_status, housekeeping_category, same_day_arrival, notes, bed_setup, housekeeper").eq("hotel_id", hotelId).eq("operation_date", operationDate)
  ]);
  const opByRoom = new Map((operations ?? []).map((row) => [row.room_id, row]));
  const { data: cleaningRows, error: cleaningError } = await supabase.from("daily_operations").select("room_id, cleaning_status").eq("hotel_id", hotelId).eq("operation_date", operationDate);
  const cleaningByRoom = new Map((cleaningRows ?? []).map((row) => [row.room_id, row.cleaning_status]));
  const es = locale === "es";
  const category = { priority: es ? "Prioridad" : "Priority", vacant_after_departure: es ? "Quedan vacías" : "Vacant after departure", remains_occupied: es ? "Permanecen ocupadas" : "Remains occupied" } as const;
  const groups = { priority: [] as string[], vacant_after_departure: [] as string[], remains_occupied: [] as string[] };
  for (const room of rooms ?? []) {
    const op = opByRoom.get(room.id);
    if (!op) continue;
    const key = op.same_day_arrival ? "priority" : op.housekeeping_category;
    // Convertible rooms with a bed setup chosen show it inline: "Habitación 10 · 3 Twin".
    const label = op.bed_setup && supportsBedSetup(room.unit_code) ? `${room.display_name} · ${bedSetupLabel(op.bed_setup, locale)}` : room.display_name;
    if (key && key in groups) groups[key as keyof typeof groups].push(label);
  }
  const dateLabel = new Intl.DateTimeFormat(es ? "es-CR" : "en-US", { timeZone: "America/Costa_Rica", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const message = ["🧹 HOTEL YULI", es ? "Limpieza" : "Housekeeping", dateLabel, "", `🔴 ${category.priority.toUpperCase()}\n(${es ? "Salida + Entrada" : "Departure + Arrival"})\n${groups.priority.join("\n") || "—"}`, "", `🟡 ${category.vacant_after_departure.toUpperCase()}\n${groups.vacant_after_departure.join("\n") || "—"}`, "", `🟢 ${category.remains_occupied.toUpperCase()}\n${groups.remains_occupied.join("\n") || "—"}`].join("\n");

  return (
    <main className="dashboard-page">
      <div className="page-heading"><div><p className="eyebrow">HOUSEKEEPING</p><h1>{es ? "Estado de habitaciones en vivo" : "Live room status"}</h1><p>{es ? "Vista operativa de las 25 unidades para hoy." : "Today’s operational view of all 25 units."}</p></div><MessageActions text={message} locale={locale} /></div>
      <section className="message-summary"><h2>{es ? "Lista para WhatsApp" : "WhatsApp summary"}</h2><pre>{message}</pre></section>
      <section className="housekeeping-grid">{(rooms ?? []).map((room) => { const op = opByRoom.get(room.id); return <article className={`housekeeping-card ${op?.same_day_arrival ? "is-priority" : ""}`} key={room.id}><div><h2>{room.display_name}</h2><span className={`status-badge status-${op?.operational_status ?? "available"}`}>{op?.operational_status === "check_in" ? "Check-in" : op?.operational_status === "staying" ? (es ? "Ocupada" : "Occupied") : (es ? "Disponible" : "Available")}</span></div><span className={`hk-category hk-${op?.housekeeping_category ?? "none"}`}>{op?.housekeeping_category ? category[op.housekeeping_category] : (es ? "Sin instrucción especial" : "No special instruction")}</span>{op?.same_day_arrival && <p>{es ? "Salida y llegada el mismo día" : "Same-day departure and arrival"}</p>}{op?.notes && <p>{op.notes}</p>}<p className="housekeeper-line">{es ? "Camarera" : "Housekeeper"}: <strong>{op?.housekeeper ? (op.housekeeper === "Other" ? (es ? "Otra" : "Other") : op.housekeeper) : (es ? "Sin asignar" : "Unassigned")}</strong></p>{op && (op.housekeeping_category || op.same_day_arrival) && (cleaningError ? <p className="panel-note">{es ? "Estado de limpieza: pendiente de activar (migración 0023)." : "Cleaning status: awaiting activation (migration 0023)."}</p> : <CleaningControls rowId={op.id} status={cleaningByRoom.get(room.id) ?? "pending"} locale={locale} />)}</article>; })}</section>
      <SaveReportButton kind="housekeeping" date={operationDate} locale={locale} text={message} />
      <ReportHistory kind="housekeeping" locale={locale} />
    </main>
  );
}
