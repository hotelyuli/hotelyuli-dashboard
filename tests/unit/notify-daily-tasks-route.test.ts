// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/notify/daily-tasks/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToHotel } from "@/lib/push";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendToHotel: vi.fn(async () => ({ sent: 2, removed: 0, failed: 0, skipped: 0 })) }));

type Task = { hotel_id: string; title: string; room_area: string | null; priority: string; created_at: string };
function adminWithTasks(tasks: Task[]) {
  const statuses: unknown[] = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => ({ select: () => ({ in: async (_: string, values: unknown) => { statuses.push(values); return { data: tasks, error: null }; } }) })
  } as never);
  return statuses;
}

const request = (auth?: string) => new NextRequest("https://app.example/api/notify/daily-tasks", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => vi.stubEnv("CRON_SECRET", "s3cret"));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("GET /api/notify/daily-tasks", () => {
  it("401 without the cron secret (or with a wrong one)", async () => {
    adminWithTasks([]);
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer nope"))).status).toBe(401);
    expect(sendToHotel).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("401 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
  });

  it("with the secret: reads open + in-progress tasks and sends one digest per hotel", async () => {
    const statuses = adminWithTasks([
      { hotel_id: "h1", title: "Fix AC", room_area: "Hab 5", priority: "high", created_at: "2026-10-06T10:00:00Z" },
      { hotel_id: "h1", title: "Pool pump", room_area: "Piscina", priority: "low", created_at: "2026-10-05T10:00:00Z" }
    ]);
    const response = await GET(request("Bearer s3cret"));
    expect(response.status).toBe(200);
    expect(statuses).toEqual([["open", "in_progress"]]);
    expect(sendToHotel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendToHotel).mock.calls[0][0]).toBe("h1");
    expect(vi.mocked(sendToHotel).mock.calls[0][1]).toMatchObject({ title: "Tareas abiertas: 2", url: "/tasks" });
    expect(await response.json()).toMatchObject({ openTasks: 2, hotels: 1, sent: 2 });
  });

  it("sends nothing when there are no open tasks", async () => {
    adminWithTasks([]);
    const response = await GET(request("Bearer s3cret"));
    expect(response.status).toBe(200);
    expect(sendToHotel).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ openTasks: 0, sent: 0 });
  });
});

describe("vercel.json crons", () => {
  it("keeps the sheets flush and adds the digest at 14:00 UTC (08:00 Costa Rica)", () => {
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(config.crons).toEqual(expect.arrayContaining([
      { path: "/api/sheets/flush", schedule: "0 12 * * *" },
      { path: "/api/notify/daily-tasks", schedule: "0 14 * * *" }
    ]));
    expect(config.crons).toHaveLength(2);
  });
});
