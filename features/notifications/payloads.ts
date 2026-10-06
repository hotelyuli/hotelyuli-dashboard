import { formatInTimeZone } from "date-fns-tz";
import { incidentCategoryLabel, priorityLabel } from "@/features/records/logic/labels";

/**
 * Push notification texts. They show on lock screens, so the builders take only the
 * fields they print, and never a guest name.
 */
export type PushPayload = { title: string; body: string; url: string; tag: string; urgency: "high" | "normal" };

export type IncidentForPush = { id: string; roomArea: string | null; category: string; priority: string; description: string };
export type TaskForPush = { title: string; roomArea: string | null; priority: string; createdAt: string };

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const TOP_TASKS = 3;

/** Collapses whitespace and cuts to `max` characters (the last one an ellipsis when cut). */
export function trimText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function incidentPayload(incident: IncidentForPush): PushPayload {
  const place = incident.roomArea?.trim() || "General";
  return {
    title: `Nuevo incidente · ${place}`,
    body: `${incidentCategoryLabel(incident.category, "es")} · ${priorityLabel(incident.priority, "es")} · ${trimText(incident.description, 90)}`,
    url: "/events",
    tag: `incident-${incident.id}`,
    urgency: incident.priority === "high" || incident.priority === "urgent" ? "high" : "normal"
  };
}

/** The 08:00 digest: top 3 open tasks by priority, then oldest. Null when there are none (send nothing). */
export function dailyTasksPayload(tasks: TaskForPush[], now: Date = new Date()): PushPayload | null {
  if (!tasks.length) return null;
  const top = [...tasks]
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, TOP_TASKS)
    .map((task) => `• ${priorityLabel(task.priority, "es")} · ${task.roomArea?.trim() ? `${task.roomArea.trim()} · ` : ""}${trimText(task.title, 60)}`);
  const rest = tasks.length - top.length;
  return {
    title: `Tareas abiertas: ${tasks.length}`,
    body: [...top, ...(rest > 0 ? [`+ ${rest} más`] : [])].join("\n"),
    url: "/tasks",
    tag: `daily-tasks-${formatInTimeZone(now, "America/Costa_Rica", "yyyy-MM-dd")}`,
    urgency: "normal"
  };
}
