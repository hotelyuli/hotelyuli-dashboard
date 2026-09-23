export const RECEPTIONISTS = ["Grettel", "Rene", "Rebeca"];

/** Team shown when today's assignment has not been saved yet (header and shift-report signer). */
export const DEFAULT_TEAM = { morning_receptionist: "Grettel", afternoon_receptionist: "Rebeca", security_guard: "Yei Hernandez" };

/** Receptionist who signs a shift report by default: the one assigned to that shift. */
export function onShiftReceptionist(shift: "morning" | "afternoon" | "night", assignment: { morning_receptionist: string; afternoon_receptionist: string } | null, fallback = ""): string {
  const team = assignment ?? DEFAULT_TEAM;
  if (shift === "morning") return team.morning_receptionist;
  if (shift === "afternoon") return team.afternoon_receptionist;
  return RECEPTIONISTS.includes(fallback) ? fallback : "";
}
