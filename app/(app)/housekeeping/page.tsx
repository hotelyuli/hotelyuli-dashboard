import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { MessageActions } from "@/features/reports/components/MessageActions";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Housekeeping" };

export default async function HousekeepingPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const [{ data: rooms }, { data: operations }] = await Promise.all([
    supabase.from("rooms").select("id, display_name, sort_order").eq("hotel_id", hotelId).eq("active", true).order("sort_order", { ascending: true }),
    supabase.from("daily_operations").select("room_id, guest_name, operational_status, housekeeping_category, same_day_arrival, notes").eq("hotel_id", hotelId).eq("operation_date", operationDate)
  ]);
  const opByRoom = new Map((operations ?? []).map((row) => [row.room_id, row]));
  const es = locale === "es";
  const category = { priority: es ? "Prioridad" : "Priority", vacant_after_departure: es ? "Libre después de salida" : "Vacant after departure", remains_occupied: es ? "Permanece ocupado" : "Remains occupied" } as const;
  const groups = { priority: [] as string[], vacant_after_departure: [] as string[], remains_occupied: [] as string[] };
  for (const room of rooms ?? []) {
    const op = opByRoom.get(room.id);
    if (!op) continue;
    const key = op.same_day_arrival ? "priority" : op.housekeeping_category;
    if (key && key in groups) groups[key as keyof typeof groups].push(`${room.display_name}${op.guest_name ? ` · ${op.guest_name}` : ""}`);
  }
  const dateLabel = formatInTimeZone(new Date(), "America/Costa_Rica", "MMMM d, yyyy");
  const message = ["🧹 HOTEL YULI", "Housekeeping", dateLabel, "", `🔴 ${category.priority.toUpperCase()}\n${groups.priority.join("\n") || "—"}`, "", `🟡 ${category.vacant_after_departure.toUpperCase()}\n${groups.vacant_after_departure.join("\n") || "—"}`, "", `🟢 ${category.remains_occupied.toUpperCase()}\n${groups.remains_occupied.join("\n") || "—"}`].join("\n");

  return (
    <main className="dashboard-page">
      <div className="page-heading"><div><p className="eyebrow">HOUSEKEEPING</p><h1>{es ? "Estado de habitaciones en vivo" : "Live room status"}</h1><p>{es ? "Vista operativa de las 25 unidades para hoy." : "Today’s operational view of all 25 units."}</p></div><MessageActions text={message} locale={locale} /></div>
      <section className="message-summary"><h2>{es ? "Lista para WhatsApp" : "WhatsApp summary"}</h2><pre>{message}</pre></section>
      <section className="housekeeping-grid">{(rooms ?? []).map((room) => { const op = opByRoom.get(room.id); return <article className={`housekeeping-card ${op?.same_day_arrival ? "is-priority" : ""}`} key={room.id}><div><h2>{room.display_name}</h2><span className={`status-badge status-${op?.operational_status ?? "available"}`}>{op?.operational_status === "check_in" ? "Check-in" : op?.operational_status === "staying" ? (es ? "Ocupada" : "Occupied") : (es ? "Disponible" : "Available")}</span></div><strong>{op?.housekeeping_category ? category[op.housekeeping_category] : (es ? "Sin instrucción especial" : "No special instruction")}</strong><small>{op?.guest_name ?? "—"}</small>{op?.same_day_arrival && <p>{es ? "Salida y llegada el mismo día" : "Same-day departure and arrival"}</p>}{op?.notes && <p>{op.notes}</p>}</article>; })}</section>
    </main>
  );
}
