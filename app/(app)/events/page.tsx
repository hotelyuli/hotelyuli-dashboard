import { getContacts } from "@/features/contacts/actions";
import { SupplierMessage } from "@/features/contacts/SupplierMessage";
import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { RegisterButton } from "@/features/records/components/RegisterForms";
import { EventEditor } from "@/features/records/components/EventEditor";
import { incidentStatusLabel, priorityLabel, taskStatusLabel } from "@/features/records/logic/labels";
import type { Locale } from "@/lib/i18n";

export default async function EventsPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const { data: events } = await supabase.from("shift_events").select("id,event_time,category,room_area,description,action_taken,status,priority").eq("hotel_id", profile?.hotel_id ?? "").eq("operation_date", operationDate).order("event_time", { ascending: false });
  const { data: linkedTasks } = await supabase.from("tasks").select("source_event_id, status, assigned_to").eq("hotel_id", profile?.hotel_id ?? "").in("source_event_id", (events ?? []).map((event) => event.id));
  const taskByEvent = new Map((linkedTasks ?? []).map((task) => [task.source_event_id, task]));
  const contacts = await getContacts();
  return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">{es ? "TURNO" : "SHIFT"}</p><h1>{es ? "Incidentes" : "Incidents"}</h1><p>{es ? "Registro compartido de lo ocurrido durante el turno." : "Shared log of everything that happened during the shift."}</p></div><RegisterButton kind="event" locale={locale} /></div><div className="board-table-wrap"><table className="board-table"><thead><tr><th>{es ? "Hora" : "Time"}</th><th>{es ? "Categoría" : "Category"}</th><th>{es ? "Habitación / Área" : "Room / Area"}</th><th>{es ? "Descripción" : "Description"}</th><th>{es ? "Acción" : "Action"}</th><th>{es ? "Estado" : "Status"}</th><th>{es ? "Prioridad" : "Priority"}</th><th>{es ? "Tarea" : "Task"}</th><th>WhatsApp</th><th>{es ? "Editar" : "Edit"}</th></tr></thead><tbody>{events?.length ? events.map((event) => <tr key={event.id}><td>{event.event_time.slice(0,5)}</td><td>{event.category.replaceAll("_", " ")}</td><td>{event.room_area ?? "—"}</td><td className="notes-cell">{event.description}</td><td className="notes-cell">{event.action_taken ?? "—"}</td><td><span className={`state-pill state-${event.status}`}>{incidentStatusLabel(event.status, es ? "es" : "en")}</span></td><td><span className={`priority-badge priority-${event.priority}`}>{priorityLabel(event.priority, es ? "es" : "en")}</span></td><td>{(() => { const task = taskByEvent.get(event.id); return task ? <span className={`state-pill state-${task.status}`}>{taskStatusLabel(task.status, es ? "es" : "en")}{task.assigned_to ? ` · ${task.assigned_to}` : ""}</span> : "—"; })()}</td><td>{event.category === "maintenance" && <SupplierMessage contacts={contacts} locale={locale} text={`Hotel Yuli — ${es ? "Incidente de mantenimiento" : "Maintenance incident"}
${event.room_area ?? ""}
${es ? "Prioridad" : "Priority"}: ${event.priority}
${event.description}
${event.action_taken ?? ""}`} />}</td><td><EventEditor locale={locale} event={{ id: event.id, status: event.status, priority: event.priority, roomArea: event.room_area, description: event.description, actionTaken: event.action_taken }} /></td></tr>) : <tr><td colSpan={10} className="empty-table-cell">{es ? "Todavía no hay incidentes registrados hoy." : "No incidents have been registered today."}</td></tr>}</tbody></table></div></main>;
}
