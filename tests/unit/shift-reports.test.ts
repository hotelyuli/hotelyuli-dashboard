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
  incidents: [], arrivals: [], departures: [], takeawayBreakfasts: [], tours: [], income: [], openTasks: [],
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

describe("buildShiftReport (structured, no AI)", () => {
  it("uses the spec title, all spec sections in order, and the Pura Vida sign-off", () => {
    const report = buildShiftReport(empty);
    expect(report.startsWith("Morning Shift Report – Wednesday, 23 September 2026\nReceptionist: Grettel")).toBe(true);
    const order = ["ARRIVALS & DEPARTURES", "GUEST SERVICE", "MAINTENANCE", "TOURS / PAYMENTS / ADMINISTRATION", "OPEN FOLLOW-UPS"].map((h) => report.indexOf(h));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(report.endsWith("Pura Vida,\nGrettel")).toBe(true);
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
    const notes = "Se entregó la llave extra de la Hab 7 a mantenimiento.\nGuest in Room 2 asked for a late checkout — pendiente de confirmar.";
    const report = buildShiftReport({ ...empty, notes });
    expect(sectionOf(report, "RECEPTIONIST NOTES")).toBe(notes);
  });

  it("lists scheduled check-ins/outs and never claims unconfirmed actions", () => {
    const report = buildShiftReport({
      ...empty,
      arrivals: [{ unit: unitLabel("5"), guest: "Ana Pérez", pax: 2, sameDayTurnover: true }],
      departures: [{ unit: unitLabel("B3"), guest: "John Smith" }],
      takeawayBreakfasts: [{ unit: "Room 5", guest: "Ana Pérez", pax: 2, time: "06:30:00" }]
    });
    const arrivals = sectionOf(report, "ARRIVALS & DEPARTURES");
    expect(arrivals).toContain("- Room 5 – Ana Pérez (2 pax) – same-day turnover, priority cleaning");
    expect(arrivals).toContain("- Dorm bed 3 – John Smith");
    expect(arrivals).toContain("Tomorrow's arrivals contacted: NOT confirmed.");
    const guest = sectionOf(report, "GUEST SERVICE");
    expect(guest).toContain("- Room 5 – Ana Pérez, 2 pax at 06:30");
    expect(guest).toContain("Takeaway breakfasts prepared: NOT confirmed.");
    expect(guest).toContain("Breakfast report sent: NOT confirmed.");
    expect(buildShiftReport({ ...empty, confirmations: { breakfastSent: true, arrivalsContacted: false, takeawayReady: false } })).toContain("Breakfast report sent: confirmed.");
  });

  it("keeps USD and CRC separate, subtracts reversals and skips unpaid entries in the totals", () => {
    const report = buildShiftReport({
      ...empty,
      tours: [{ guest: "Ana", room: "5", tour: "Whale Watching", tourDate: "2026-09-24", operator: "Ballena Tours", pax: 2, status: "paid", commission: 20, currency: "USD" }],
      income: [
        { time: "09:00", category: "Accommodation", guest: "Ana", room: "Habitación 5", amount: 150, currency: "USD", method: "Visa", paid: true, entryType: "payment", reason: null },
        { time: "09:30", category: "Accommodation", guest: "Ana", room: "Habitación 5", amount: 50, currency: "USD", method: "Visa", paid: true, entryType: "reversal", reason: "Partial refund" },
        { time: "10:00", category: "Laundry", guest: "Luis", room: null, amount: 5000, currency: "CRC", method: "Cash CRC", paid: true, entryType: "payment", reason: null },
        { time: "11:00", category: "Restaurant", guest: "Luis", room: null, amount: 30, currency: "USD", method: "Cash USD", paid: false, entryType: "payment", reason: null }
      ]
    });
    const admin = sectionOf(report, "TOURS / PAYMENTS / ADMINISTRATION");
    expect(admin).toContain("Whale Watching on 2026-09-24 with Ballena Tours – Ana (5), 2 pax, paid; hotel commission USD 20.00");
    expect(admin).toContain("REVERSAL of Accommodation · Ana (Habitación 5) · -USD 50.00 · Visa · reason: Partial refund");
    expect(admin).toContain("unpaid, not counted");
    expect(admin).toContain("Settled income: USD 100.00 | CRC 5000.00 (currencies kept separate).");
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
