// Deterministic English shift report (spec §13), built only from saved facts.
// No AI: every line below comes from a record or from the receptionist's own
// notes, which are copied verbatim (Spanish or English).

export type IncidentCategory = "arriving" | "departure" | "guest_request" | "guest_complaint" | "maintenance" | "security" | "other";

export type ReportFacts = {
  date: string;
  shift: "morning" | "afternoon" | "night";
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
  arrivals: { unit: string; guest: string | null; pax: number; sameDayTurnover: boolean }[];
  departures: { unit: string; guest: string | null }[];
  takeawayBreakfasts: { unit: string; guest: string | null; pax: number; time: string | null }[];
  tours: { guest: string; room: string | null; tour: string; tourDate: string; operator: string; pax: number; status: string; commission: number; currency: string }[];
  income: { time: string; category: string; guest: string; room: string | null; amount: number; currency: "USD" | "CRC"; method: string; paid: boolean; entryType: "payment" | "reversal"; reason: string | null }[];
  openTasks: { title: string; roomArea: string | null; status: string; assignedTo: string | null; carriedOver: boolean }[];
  confirmations: { breakfastSent: boolean; arrivalsContacted: boolean; takeawayReady: boolean };
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

function money(currency: string, amount: number) {
  return `${currency} ${amount.toFixed(2)}`;
}

function confirmed(value: boolean) {
  return value ? "confirmed" : "NOT confirmed";
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

export function buildShiftReport(facts: ReportFacts): string {
  const lines: string[] = [reportTitle(facts.shift, facts.date), `Receptionist: ${facts.receptionist}`, ""];
  const section = (title: string, body: string[]) => { lines.push(title.toUpperCase(), ...(body.length ? body : [NOTHING]), ""); };

  // Arrivals & Departures — board data is the day's plan, not confirmed physical arrivals.
  const arrivals: string[] = [];
  if (facts.arrivals.length) {
    arrivals.push(`Scheduled check-ins (${facts.arrivals.length}):`, ...facts.arrivals.map((a) => `- ${a.unit} – ${a.guest ?? "guest name not recorded"}${a.pax ? ` (${a.pax} pax)` : ""}${a.sameDayTurnover ? " – same-day turnover, priority cleaning" : ""}`));
  }
  if (facts.departures.length) {
    arrivals.push(`Scheduled check-outs (${facts.departures.length}):`, ...facts.departures.map((d) => `- ${d.unit} – ${d.guest ?? "guest name not recorded"}`));
  }
  arrivals.push(...incidentsIn(facts, "arrivals"));
  if (arrivals.length) arrivals.push(`Tomorrow's arrivals contacted: ${confirmed(facts.confirmations.arrivalsContacted)}.`);
  section("Arrivals & Departures", arrivals);

  const guest = [...incidentsIn(facts, "guest")];
  if (facts.takeawayBreakfasts.length) {
    guest.push(`Takeaway breakfasts (${facts.takeawayBreakfasts.length}):`, ...facts.takeawayBreakfasts.map((t) => `- ${t.unit} – ${t.guest ?? "guest"}${t.pax ? `, ${t.pax} pax` : ""}${t.time ? ` at ${t.time.slice(0, 5)}` : ""}`));
    guest.push(`Takeaway breakfasts prepared: ${confirmed(facts.confirmations.takeawayReady)}.`);
  }
  guest.push(`Breakfast report sent: ${confirmed(facts.confirmations.breakfastSent)}.`);
  section("Guest Service", guest);

  section("Maintenance", incidentsIn(facts, "maintenance"));

  const other = incidentsIn(facts, "other");
  if (other.length) section("Security & Other", other);

  // Tours / Payments / Administration — USD and CRC are never combined.
  const admin: string[] = [];
  if (facts.tours.length) {
    admin.push(`Tours recorded (${facts.tours.length}):`, ...facts.tours.map((t) => `- ${t.tour} on ${t.tourDate} with ${t.operator} – ${t.guest}${t.room ? ` (${t.room})` : ""}, ${t.pax} pax, ${t.status}; hotel commission ${money(t.currency, t.commission)}`));
  }
  if (facts.income.length) {
    const totals = { USD: 0, CRC: 0 };
    admin.push(`Income recorded (${facts.income.length}):`);
    for (const entry of [...facts.income].sort((a, b) => a.time.localeCompare(b.time))) {
      const reversal = entry.entryType === "reversal";
      if (entry.paid) totals[entry.currency] += reversal ? -entry.amount : entry.amount;
      admin.push(`- ${entry.time.slice(0, 5)} · ${reversal ? "REVERSAL of " : ""}${entry.category} · ${entry.guest}${entry.room ? ` (${entry.room})` : ""} · ${reversal ? "-" : ""}${money(entry.currency, entry.amount)} · ${entry.method}${entry.paid ? "" : " · unpaid, not counted"}${reversal && entry.reason ? ` · reason: ${entry.reason}` : ""}`);
    }
    admin.push(`Settled income: ${money("USD", totals.USD)} | ${money("CRC", totals.CRC)} (currencies kept separate).`);
  }
  section("Tours / Payments / Administration", admin);

  section("Open Follow-ups", facts.openTasks.map((task) => `- ${task.title.trim()}${task.roomArea ? ` – ${task.roomArea}` : ""} (${TASK_STATUS[task.status] ?? task.status}${task.assignedTo ? `, assigned to ${task.assignedTo}` : ", unassigned"}${task.carriedOver ? ", pending from an earlier day" : ""})`));

  if (facts.notes.trim()) section("Receptionist Notes", [facts.notes.trim()]);

  lines.push("Pura Vida,", facts.receptionist);
  return lines.join("\n");
}
