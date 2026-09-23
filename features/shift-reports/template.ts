// Shift report facts (spec §13, refined with the owner): a concise handover, not a data
// dump. The facts deliberately carry NO guest names and NO payments (payments are
// reported separately from the Income module), and only counts for arrivals and
// departures. The same facts feed Claude (ai.ts) and this non-AI fallback, so neither
// can mention what is not here.

export type IncidentCategory = "arriving" | "departure" | "guest_request" | "guest_complaint" | "maintenance" | "security" | "other";

export type ReportFacts = {
  date: string;
  shift: "morning" | "afternoon" | "night";
  /** The receptionist on shift who signs the report. */
  receptionist: string;
  incidents: {
    time: string;
    category: string;
    roomArea: string | null;
    description: string;
    actionTaken: string | null;
    status: string;
    priority: string;
    task: { status: string; assignedTo: string | null } | null;
  }[];
  /** Scheduled today from the board/reservations: counts only, no rosters. */
  arrivals: { count: number; sameDayTurnovers: number };
  departures: { count: number };
  takeawayBreakfasts: { unit: string; pax: number; time: string | null }[];
  /** Brief: no guest names, no prices or commissions. */
  tours: { room: string | null; tour: string; tourDate: string; operator: string; pax: number; status: string }[];
  openTasks: { title: string; roomArea: string | null; status: string; assignedTo: string | null; carriedOver: boolean }[];
  confirmations: { breakfastSent: boolean; arrivalsContacted: boolean; takeawayReady: boolean };
  /** A breakfast report was saved in YuliOS for this date (report_snapshots), independent of the checkbox. */
  breakfastReportSaved: boolean;
  notes: string;
};

const SECTION_OF: Record<string, "arrivals" | "guest" | "maintenance" | "other"> = {
  arriving: "arrivals",
  departure: "arrivals",
  guest_request: "guest",
  guest_complaint: "guest",
  maintenance: "maintenance",
  security: "other",
  other: "other"
};

const INCIDENT_STATUS: Record<string, string> = { completed: "completed", temporary_solution: "temporary solution", follow_up: "follow-up", open: "open" };
const TASK_STATUS: Record<string, string> = { open: "open", in_progress: "in progress", completed: "completed", cancelled: "cancelled" };
const CATEGORY: Record<string, string> = { arriving: "Arrival", departure: "Departure", guest_request: "Guest request", guest_complaint: "Guest complaint", maintenance: "Maintenance", security: "Security", other: "Other" };
const NOTHING = "- Nothing to report.";

export function unitLabel(unitCode: string): string {
  const bed = unitCode.match(/^B(\d+)$/i);
  return bed ? `Dorm bed ${bed[1]}` : `Room ${unitCode}`;
}

function confirmed(value: boolean) {
  return value ? "confirmed" : "NOT confirmed";
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function incidentLine(incident: ReportFacts["incidents"][number]) {
  const parts = [`- ${incident.time.slice(0, 5)}`];
  if (incident.roomArea) parts.push(incident.roomArea);
  if (SECTION_OF[incident.category] === "other") parts.push(CATEGORY[incident.category] ?? incident.category);
  let line = `${parts.join(" · ")} — ${incident.description.trim()}`;
  if (incident.actionTaken?.trim()) line += ` Action taken: ${incident.actionTaken.trim()}`;
  line += ` (Status: ${INCIDENT_STATUS[incident.status] ?? incident.status}${incident.priority === "high" || incident.priority === "urgent" ? `, ${incident.priority} priority` : ""}`;
  if (incident.task) line += `; task ${TASK_STATUS[incident.task.status] ?? incident.task.status}${incident.task.assignedTo ? `, assigned to ${incident.task.assignedTo}` : ""}`;
  return `${line})`;
}

function incidentsIn(facts: ReportFacts, section: "arrivals" | "guest" | "maintenance" | "other") {
  return facts.incidents.filter((incident) => (SECTION_OF[incident.category] ?? "other") === section).sort((a, b) => a.time.localeCompare(b.time)).map(incidentLine);
}

export function reportTitle(shift: ReportFacts["shift"], date: string) {
  const label = { morning: "Morning", afternoon: "Afternoon", night: "Night" }[shift];
  const pretty = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return `${label} Shift Report – ${pretty}`;
}

/** Structured non-AI report from the same facts (used when AI is off or fails). */
export function buildShiftReport(facts: ReportFacts): string {
  const lines: string[] = [reportTitle(facts.shift, facts.date), ""];
  const section = (title: string, body: string[]) => { lines.push(title.toUpperCase(), ...(body.length ? body : [NOTHING]), ""); };

  // Arrivals & Departures: one summary line, no per-room roster.
  const arrivals: string[] = [];
  if (facts.arrivals.count || facts.departures.count) {
    arrivals.push(`Scheduled today: ${plural(facts.arrivals.count, "check-in")}${facts.arrivals.sameDayTurnovers ? ` (${plural(facts.arrivals.sameDayTurnovers, "same-day turnover")})` : ""}, ${plural(facts.departures.count, "check-out")}.`);
  }
  arrivals.push(...incidentsIn(facts, "arrivals"));
  if (arrivals.length) arrivals.push(`Tomorrow's arrivals contacted: ${confirmed(facts.confirmations.arrivalsContacted)}.`);
  section("Arrivals & Departures", arrivals);

  const guest = [...incidentsIn(facts, "guest")];
  if (facts.takeawayBreakfasts.length) {
    guest.push(`Takeaway breakfasts: ${facts.takeawayBreakfasts.map((t) => `${t.unit}${t.pax ? ` (${t.pax} pax)` : ""}${t.time ? ` at ${t.time.slice(0, 5)}` : ""}`).join(", ")}.`);
    guest.push(`Takeaway breakfasts prepared: ${confirmed(facts.confirmations.takeawayReady)}.`);
  }
  guest.push(`Breakfast report sent: ${confirmed(facts.confirmations.breakfastSent)}.`);
  guest.push(`Breakfast report saved in YuliOS: ${facts.breakfastReportSaved ? "yes" : "no"}.`);
  section("Guest Service", guest);

  section("Maintenance", incidentsIn(facts, "maintenance"));

  const other = incidentsIn(facts, "other");
  if (other.length) section("Security & Other", other);

  // Tours, brief: no guest names, no money (payments are reported from the Income module).
  section("Tours", facts.tours.map((t) => `- ${t.tour} on ${t.tourDate} with ${t.operator}${t.room ? ` – ${t.room}` : ""}, ${t.pax} pax (${t.status})`));

  section("Open Follow-ups", facts.openTasks.map((task) => `- ${task.title.trim()}${task.roomArea ? ` – ${task.roomArea}` : ""} (${TASK_STATUS[task.status] ?? task.status}${task.assignedTo ? `, assigned to ${task.assignedTo}` : ", unassigned"}${task.carriedOver ? ", pending from an earlier day" : ""})`));

  if (facts.notes.trim()) section("Receptionist Notes", [facts.notes.trim()]);

  lines.push("Pura Vida,", facts.receptionist);
  return lines.join("\n");
}
