import { cookies } from "next/headers";
import { TaskEditor } from "@/features/records/components/TaskEditor";
import { EventEditor } from "@/features/records/components/EventEditor";
import { requireSession } from "@/features/auth/logic/guards";
import type { Locale } from "@/lib/i18n";

export default async function TasksPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const { data: tasks } = await supabase.from("tasks").select("id,title,room_area,priority,status,assigned_to,due_at,source_event_id").eq("hotel_id", profile?.hotel_id ?? "").in("status", ["open", "in_progress"]).order("created_at", { ascending: false });
  const eventIds = (tasks ?? []).flatMap((task) => (task.source_event_id ? [task.source_event_id] : []));
  const { data: events } = eventIds.length
    ? await supabase.from("shift_events").select("id,operation_date,event_time,category,room_area,description,action_taken,status,priority").eq("hotel_id", profile?.hotel_id ?? "").in("id", eventIds)
    : { data: [] };
  const eventById = new Map((events ?? []).map((event) => [event.id, event]));
  const eventStatusLabel: Record<string, string> = es ? { completed: "Completado", temporary_solution: "Solución temporal", follow_up: "Seguimiento", open: "Pendiente" } : { completed: "Completed", temporary_solution: "Temporary solution", follow_up: "Follow-up", open: "Open" };
  return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">{es ? "SEGUIMIENTO" : "FOLLOW-UP"}</p><h1>{es ? "Tareas abiertas" : "Open tasks"}</h1><p>{es ? "Los incidentes sin resolver aparecen aquí automáticamente. Completar el incidente cierra su tarea; completar la tarea no cambia el incidente." : "Unresolved incidents appear here automatically. Completing the incident closes its task; completing the task leaves the incident unchanged."}</p></div></div><div className="board-table-wrap"><table className="board-table"><thead><tr><th>{es ? "Tarea" : "Task"}</th><th>{es ? "Incidente de origen" : "Source incident"}</th><th>{es ? "Habitación / Área" : "Room / Area"}</th><th>{es ? "Prioridad" : "Priority"}</th><th>{es ? "Estado" : "Status"}</th><th>{es ? "Asignado" : "Assigned"}</th><th>{es ? "Vence" : "Due"}</th><th>{es ? "Actualizar" : "Update"}</th></tr></thead><tbody>{tasks?.length ? tasks.map((task) => { const event = task.source_event_id ? eventById.get(task.source_event_id) : undefined; return <tr key={task.id}><td className="notes-cell">{task.title}</td><td>{event ? <div className="source-incident"><small>{event.operation_date} · {event.event_time.slice(0, 5)} · {event.category.replaceAll("_", " ")}</small><span className="count-pill">{eventStatusLabel[event.status] ?? event.status}</span><EventEditor locale={locale} event={{ id: event.id, status: event.status, priority: event.priority, roomArea: event.room_area, description: event.description, actionTaken: event.action_taken }} /></div> : "—"}</td><td>{task.room_area ?? "—"}</td><td>{task.priority}</td><td>{task.status.replaceAll("_", " ")}</td><td>{task.assigned_to ?? "—"}</td><td>{task.due_at ? new Date(task.due_at).toLocaleString(locale) : "—"}</td><td><TaskEditor id={task.id} status={task.status} assignedTo={task.assigned_to} locale={locale} /></td></tr>; }) : <tr><td colSpan={8} className="empty-table-cell">{es ? "No hay tareas abiertas." : "There are no open tasks."}</td></tr>}</tbody></table></div></main>;
}
