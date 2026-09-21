import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { RegisterButton } from "@/features/records/components/RegisterForms";
import type { Locale } from "@/lib/i18n";

export default async function EventsPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const { data: events } = await supabase.from("shift_events").select("id,event_time,category,room_area,description,action_taken,status,priority").eq("hotel_id", profile?.hotel_id ?? "").eq("operation_date", operationDate).order("event_time", { ascending: false });
  return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">{es ? "TURNO" : "SHIFT"}</p><h1>{es ? "Eventos" : "Events"}</h1><p>{es ? "Registro compartido de lo ocurrido durante el turno." : "Shared log of everything that happened during the shift."}</p></div><RegisterButton kind="event" locale={locale} /></div><div className="board-table-wrap"><table className="board-table"><thead><tr><th>{es ? "Hora" : "Time"}</th><th>{es ? "Categoría" : "Category"}</th><th>{es ? "Habitación / Área" : "Room / Area"}</th><th>{es ? "Descripción" : "Description"}</th><th>{es ? "Acción" : "Action"}</th><th>{es ? "Estado" : "Status"}</th><th>{es ? "Prioridad" : "Priority"}</th></tr></thead><tbody>{events?.length ? events.map((event) => <tr key={event.id}><td>{event.event_time.slice(0,5)}</td><td>{event.category.replaceAll("_", " ")}</td><td>{event.room_area ?? "—"}</td><td className="notes-cell">{event.description}</td><td className="notes-cell">{event.action_taken ?? "—"}</td><td>{event.status.replaceAll("_", " ")}</td><td>{event.priority}</td></tr>) : <tr><td colSpan={7} className="empty-table-cell">{es ? "Todavía no hay eventos registrados hoy." : "No events have been registered today."}</td></tr>}</tbody></table></div></main>;
}
