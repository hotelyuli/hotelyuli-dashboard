import { cookies } from "next/headers";
import { requireSession } from "@/features/auth/logic/guards";
import type { Locale } from "@/lib/i18n";

export default async function TasksPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const { data: tasks } = await supabase.from("tasks").select("id,title,room_area,priority,status,assigned_to,due_at").eq("hotel_id", profile?.hotel_id ?? "").in("status", ["open", "in_progress"]).order("created_at", { ascending: false });
  return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">{es ? "SEGUIMIENTO" : "FOLLOW-UP"}</p><h1>{es ? "Tareas abiertas" : "Open tasks"}</h1><p>{es ? "Los eventos sin resolver aparecen aquí automáticamente." : "Unresolved events appear here automatically."}</p></div></div><div className="board-table-wrap"><table className="board-table"><thead><tr><th>{es ? "Tarea" : "Task"}</th><th>{es ? "Habitación / Área" : "Room / Area"}</th><th>{es ? "Prioridad" : "Priority"}</th><th>{es ? "Estado" : "Status"}</th><th>{es ? "Asignado" : "Assigned"}</th><th>{es ? "Vence" : "Due"}</th></tr></thead><tbody>{tasks?.length ? tasks.map((task) => <tr key={task.id}><td className="notes-cell">{task.title}</td><td>{task.room_area ?? "—"}</td><td>{task.priority}</td><td>{task.status.replaceAll("_", " ")}</td><td>{task.assigned_to ?? "—"}</td><td>{task.due_at ? new Date(task.due_at).toLocaleString(locale) : "—"}</td></tr>) : <tr><td colSpan={6} className="empty-table-cell">{es ? "No hay tareas abiertas." : "There are no open tasks."}</td></tr>}</tbody></table></div></main>;
}
