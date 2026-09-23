import { describe, expect, it } from "vitest";
import { canClose, reportInput } from "@/features/shift-reports/logic";
import { buildShiftReport, reportTitle, unitLabel, type ReportFacts } from "@/features/shift-reports/template";

const input = { date: "2026-09-21", shift: "morning" as const, receptionist: "Grettel", eventIds: [], notes: "", breakfastSent: false, arrivalsContacted: false, takeawayReady: false, eventsReviewed: true, tasksReviewed: true, breakfastReviewed: false, incomeReviewed: false, cashReviewed: false, handover: true };

describe("shift close", () => {
  it("requires reviewed tasks and handover", () => {
    expect(canClose(input)).toBe(true);
    expect(canClose({ ...input, tasksReviewed: false })).toBe(false);
    expect(canClose({ ...input, handover: false })).toBe(false);
  });
  it("requires financial and breakfast checks for afternoon/night", () => {
    for (const shift of ["afternoon", "night"] as const) {
      expect(canClose({ ...input, shift })).toBe(false);
      expect(canClose({ ...input, shift, breakfastReviewed: true, incomeReviewed: true, cashReviewed: true })).toBe(true);
    }
  });
  it("rejects invalid dates and oversized notes", () => {
    expect(reportInput.safeParse({ ...input, date: "2026-02-30" }).success).toBe(false);
    expect(reportInput.safeParse({ ...input, notes: "a".repeat(6001) }).success).toBe(false);
  });
});

const empty: ReportFacts = {
  date: "2026-09-23", shift: "morning", receptionist: "Grettel",
  incidents: [], arrivals: { count: 0, sameDayTurnovers: 0 }, departures: { count: 0 }, takeawayBreakfasts: [], tours: [], openTasks: [],
  confirmations: { breakfastSent: false, arrivalsContacted: false, takeawayReady: false }, breakfastReportSaved: false, notes: ""
};

const incident = (category: string, overrides: Partial<ReportFacts["incidents"][number]> = {}): ReportFacts["incidents"][number] => ({
  time: "10:15:00", category, roomArea: "Room 5", description: `${category} description`, actionTaken: null, status: "completed", priority: "medium", task: null, ...overrides
});

function sectionOf(report: string, heading: string) {
  const start = report.indexOf(`${heading}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = report.slice(start + heading.length + 1);
  return rest.slice(0, rest.indexOf("\n\n"));
}

describe("buildShiftReport (structured fallback, no AI)", () => {
  it("starts with the title, keeps the sections in order and signs with the receptionist on shift", () => {
    const report = buildShiftReport({ ...empty, receptionist: "Rene" });
    expect(report.startsWith("Morning Shift Report – Wednesday, 23 September 2026\n\nARRIVALS & DEPARTURES")).toBe(true);
    const order = ["ARRIVALS & DEPARTURES", "GUEST SERVICE", "MAINTENANCE", "TOURS", "OPEN FOLLOW-UPS"].map((h) => report.indexOf(h));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(report.endsWith("Pura Vida,\nRene")).toBe(true);
    expect(sectionOf(report, "MAINTENANCE")).toBe("- Nothing to report.");
  });

  it("titles afternoon and night shifts", () => {
    expect(reportTitle("afternoon", "2026-09-23")).toMatch(/^Afternoon Shift Report – /);
    expect(reportTitle("night", "2026-09-23")).toMatch(/^Night Shift Report – /);
  });

  it("includes every incident, grouped into its section with action, status and task", () => {
    const report = buildShiftReport({
      ...empty,
      incidents: [
        incident("maintenance", { description: "AC leaking", actionTaken: "Technician called", status: "follow_up", priority: "high", task: { status: "open", assignedTo: "Marcos" } }),
        incident("guest_complaint", { roomArea: "Room 9", description: "Noise from the road" }),
        incident("arriving", { roomArea: "Room 3", description: "Late arrival at 23:00" }),
        incident("security", { roomArea: "Parking", description: "Gate left open" })
      ]
    });
    expect(sectionOf(report, "MAINTENANCE")).toBe("- 10:15 · Room 5 — AC leaking Action taken: Technician called (Status: follow-up, high priority; task open, assigned to Marcos)");
    expect(sectionOf(report, "GUEST SERVICE")).toContain("Room 9 — Noise from the road");
    expect(sectionOf(report, "ARRIVALS & DEPARTURES")).toContain("Room 3 — Late arrival at 23:00");
    expect(sectionOf(report, "SECURITY & OTHER")).toContain("Parking · Security — Gate left open");
  });

  it("omits Security & Other when there is nothing for it", () => {
    expect(buildShiftReport(empty)).not.toContain("SECURITY & OTHER");
  });

  it("copies Spanish or English notes verbatim", () => {
    const notes = "Se entregó la llave extra de la Hab 7 a mantenimiento.\nRoom 2 asked for a late checkout — pendiente de confirmar.";
    expect(sectionOf(buildShiftReport({ ...empty, notes }), "RECEPTIONIST NOTES")).toBe(notes);
  });

  it("summarises arrivals/departures as counts only (no roster) and never claims unconfirmed actions", () => {
    const report = buildShiftReport({
      ...empty,
      arrivals: { count: 4, sameDayTurnovers: 1 },
      departures: { count: 1 },
      takeawayBreakfasts: [{ unit: unitLabel("5"), pax: 2, time: "06:30:00" }]
    });
    const arrivals = sectionOf(report, "ARRIVALS & DEPARTURES");
    expect(arrivals).toBe("Scheduled today: 4 check-ins (1 same-day turnover), 1 check-out.\nTomorrow's arrivals contacted: NOT confirmed.");
    const guest = sectionOf(report, "GUEST SERVICE");
    expect(guest).toContain("Takeaway breakfasts: Room 5 (2 pax) at 06:30.");
    expect(guest).toContain("Takeaway breakfasts prepared: NOT confirmed.");
    expect(guest).toContain("Breakfast report sent: NOT confirmed.");
    expect(buildShiftReport({ ...empty, confirmations: { breakfastSent: true, arrivalsContacted: false, takeawayReady: false } })).toContain("Breakfast report sent: confirmed.");
  });

  it("lists tours briefly with no guest names and no money, and has no payments section", () => {
    const report = buildShiftReport({ ...empty, tours: [{ room: "5", tour: "Whale Watching", tourDate: "2026-09-24", operator: "Ballena Tours", pax: 2, status: "paid" }] });
    expect(sectionOf(report, "TOURS")).toBe("- Whale Watching on 2026-09-24 with Ballena Tours – 5, 2 pax (paid)");
    expect(report).not.toMatch(/USD|CRC|income|payment|commission/i);
  });

  it("labels carried-over follow-ups as pending, not new", () => {
    const report = buildShiftReport({ ...empty, openTasks: [{ title: "Fix Room 12 shower", roomArea: "Room 12", status: "in_progress", assignedTo: null, carriedOver: true }] });
    expect(sectionOf(report, "OPEN FOLLOW-UPS")).toBe("- Fix Room 12 shower – Room 12 (in progress, unassigned, pending from an earlier day)");
  });

  it("is deterministic: the same facts always give the same report", () => {
    const facts = { ...empty, incidents: [incident("maintenance"), incident("guest_request")] };
    expect(buildShiftReport(facts)).toBe(buildShiftReport(structuredClone(facts)));
  });
});
