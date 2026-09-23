// Housekeeping work board (migration 0023): pending -> ready_for_inspection -> clean.
// Stored keys must match daily_operations_cleaning_status_check.

export const CLEANING_STATUSES = ["pending", "ready_for_inspection", "clean"] as const;
export type CleaningStatus = (typeof CLEANING_STATUSES)[number];

/** The status each action moves a room to, and the only status it may start from. */
export const CLEANING_ACTIONS = {
  mark_ready: { from: "pending", to: "ready_for_inspection" },
  pass_inspection: { from: "ready_for_inspection", to: "clean" }
} as const satisfies Record<string, { from: CleaningStatus; to: CleaningStatus }>;
export type CleaningAction = keyof typeof CLEANING_ACTIONS;

/** Next status for an action, or null when the room is not in the state the action expects. */
export function nextCleaningStatus(current: CleaningStatus, action: CleaningAction): CleaningStatus | null {
  const step = CLEANING_ACTIONS[action];
  return current === step.from ? step.to : null;
}

export function cleaningStatusLabel(status: CleaningStatus, locale: "es" | "en"): string {
  const labels: Record<CleaningStatus, [string, string]> = {
    pending: ["En limpieza", "Cleaning"],
    ready_for_inspection: ["Inspección", "Inspection"],
    clean: ["Lista", "Clean"]
  };
  return labels[status][locale === "es" ? 0 : 1];
}
