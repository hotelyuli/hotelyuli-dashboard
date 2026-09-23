// Shared labels for incident / task badges (pill classes live in globals.css:
// .priority-badge.priority-{low|medium|high|urgent}, .state-pill.state-{status}).

type Lang = "es" | "en";
const pick = (labels: Record<string, [string, string]>, value: string, lang: Lang) => labels[value]?.[lang === "es" ? 0 : 1] ?? value.replaceAll("_", " ");

export function priorityLabel(priority: string, lang: Lang): string {
  return pick({ low: ["Baja", "Low"], medium: ["Media", "Medium"], high: ["Alta", "High"], urgent: ["Urgente", "Urgent"] }, priority, lang);
}

export function taskStatusLabel(status: string, lang: Lang): string {
  return pick({ open: ["Pendiente", "Open"], in_progress: ["En progreso", "In progress"], completed: ["Completada", "Completed"], cancelled: ["Cancelada", "Cancelled"] }, status, lang);
}

export function incidentStatusLabel(status: string, lang: Lang): string {
  return pick({ open: ["Pendiente", "Open"], follow_up: ["Seguimiento", "Follow-up"], temporary_solution: ["Solución temporal", "Temporary solution"], completed: ["Completado", "Completed"] }, status, lang);
}
