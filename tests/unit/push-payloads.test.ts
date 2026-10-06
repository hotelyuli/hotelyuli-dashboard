import { describe, expect, it } from "vitest";
import { dailyTasksPayload, incidentPayload, trimText, type TaskForPush } from "@/features/notifications/payloads";

const task = (title: string, priority: string, createdAt: string, roomArea: string | null = null): TaskForPush => ({ title, priority, createdAt, roomArea });

describe("incident push payload", () => {
  it("titles with the room/area and shows category · priority · description", () => {
    const payload = incidentPayload({ id: "e1", roomArea: "Hab 5", category: "maintenance", priority: "high", description: "AC leaking" });
    expect(payload).toEqual({ title: "Nuevo incidente · Hab 5", body: "Mantenimiento · Alta · AC leaking", url: "/events", tag: "incident-e1", urgency: "high" });
  });

  it("uses high urgency only for high/urgent priority, and a fallback place", () => {
    expect(incidentPayload({ id: "e2", roomArea: null, category: "other", priority: "urgent", description: "x" })).toMatchObject({ title: "Nuevo incidente · General", urgency: "high" });
    expect(incidentPayload({ id: "e3", roomArea: " ", category: "other", priority: "medium", description: "x" }).urgency).toBe("normal");
  });

  it("trims the description to 90 characters", () => {
    const description = "a".repeat(200);
    const body = incidentPayload({ id: "e4", roomArea: "Piscina", category: "other", priority: "low", description }).body;
    const shown = body.split(" · ")[2];
    expect(shown).toHaveLength(90);
    expect(shown.endsWith("…")).toBe(true);
    expect(trimText("  short\n text ", 90)).toBe("short text");
    expect(trimText("b".repeat(90), 90)).toBe("b".repeat(90));
  });

  it("never prints a guest name, even if one is passed along", () => {
    const incident = { id: "e5", roomArea: "Hab 7", category: "guest_request", priority: "low", description: "Extra towels", guestName: "Maria Fernandez", guest_name: "Maria Fernandez" };
    const payload = incidentPayload(incident);
    expect(JSON.stringify(payload)).not.toContain("Maria");
  });
});

describe("daily tasks digest payload", () => {
  const now = new Date("2026-10-07T14:00:00Z");

  it("sends nothing when there are no open tasks", () => {
    expect(dailyTasksPayload([], now)).toBeNull();
  });

  it("one task: count title, the task line, no 'más'", () => {
    const payload = dailyTasksPayload([task("Fix AC", "medium", "2026-10-06T10:00:00Z", "Hab 5")], now);
    expect(payload).toEqual({ title: "Tareas abiertas: 1", body: "• Media · Hab 5 · Fix AC", url: "/tasks", tag: "daily-tasks-2026-10-07", urgency: "normal" });
  });

  it("many tasks: top 3 by priority then oldest, then '+ M más'", () => {
    const payload = dailyTasksPayload([
      task("low old", "low", "2026-10-01T00:00:00Z"),
      task("high new", "high", "2026-10-06T00:00:00Z"),
      task("urgent", "urgent", "2026-10-05T00:00:00Z"),
      task("high old", "high", "2026-10-02T00:00:00Z"),
      task("medium", "medium", "2026-10-01T00:00:00Z")
    ], now)!;
    expect(payload.title).toBe("Tareas abiertas: 5");
    expect(payload.body.split("\n")).toEqual(["• Urgente · urgent", "• Alta · high old", "• Alta · high new", "+ 2 más"]);
  });

  it("dates the tag in Costa Rica time", () => {
    expect(dailyTasksPayload([task("x", "low", "2026-10-01T00:00:00Z")], new Date("2026-10-08T03:00:00Z"))!.tag).toBe("daily-tasks-2026-10-07");
  });

  it("never prints a guest name", () => {
    const withGuest = { ...task("Late checkout", "low", "2026-10-01T00:00:00Z", "Hab 3"), guestName: "John Smith" } as TaskForPush;
    expect(JSON.stringify(dailyTasksPayload([withGuest], now))).not.toContain("John");
  });
});
