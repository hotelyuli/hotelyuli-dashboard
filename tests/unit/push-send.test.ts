// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, sendToHotel, type PushTarget } from "@/lib/push";
import type { PushPayload } from "@/features/notifications/payloads";

vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const calls: { op: string; values?: unknown; id?: unknown }[] = [];
function fakeAdmin(subscriptions: PushTarget[] = []) {
  return {
    from: () => ({
      delete: () => ({ eq: async (_: string, id: unknown) => { calls.push({ op: "delete", id }); return { error: null }; } }),
      update: (values: unknown) => ({ eq: async (_: string, id: unknown) => { calls.push({ op: "update", values, id }); return { error: null }; } }),
      select: () => ({ eq: async () => ({ data: subscriptions, error: null }) })
    })
  };
}

const target: PushTarget = { id: "sub-1", endpoint: "https://push.example/abc", p256dh: "p", auth: "a", failure_count: 2 };
const payload: PushPayload = { title: "T", body: "B", url: "/events", tag: "incident-1", urgency: "high" };

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  vi.mocked(createAdminClient).mockReturnValue(fakeAdmin([target, { ...target, id: "sub-2" }]) as never);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("sendPush", () => {
  it("deletes the subscription when the push service answers 410 Gone", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    await expect(sendPush(target, payload)).resolves.toBe("removed");
    expect(calls).toEqual([{ op: "delete", id: "sub-1" }]);
  });

  it("deletes on 404 too", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue(Object.assign(new Error("not found"), { statusCode: 404 }));
    await expect(sendPush(target, payload)).resolves.toBe("removed");
  });

  it("other errors increment failure_count and never throw", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 500 }));
    await expect(sendPush(target, payload)).resolves.toBe("failed");
    expect(calls).toEqual([{ op: "update", values: { failure_count: 3 }, id: "sub-1" }]);
  });

  it("sends with TTL 3600, the payload's urgency and the VAPID details", async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);
    await expect(sendPush(target, payload)).resolves.toBe("sent");
    const [subscription, body, options] = vi.mocked(webpush.sendNotification).mock.calls[0];
    expect(subscription).toEqual({ endpoint: target.endpoint, keys: { p256dh: "p", auth: "a" } });
    expect(JSON.parse(body as string)).toEqual(payload);
    expect(options).toMatchObject({ TTL: 3600, urgency: "high", vapidDetails: { subject: "mailto:test@example.com", publicKey: "public-key", privateKey: "private-key" } });
  });

  it("skips without VAPID env and does not touch the database", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await expect(sendPush(target, payload)).resolves.toBe("skipped");
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe("sendToHotel", () => {
  it("sends to every subscription and counts outcomes, even when some fail", async () => {
    vi.mocked(webpush.sendNotification)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await expect(sendToHotel("hotel-1", payload)).resolves.toEqual({ sent: 1, removed: 1, failed: 0, skipped: 0 });
  });

  it("never throws when the database is unreachable", async () => {
    vi.mocked(createAdminClient).mockImplementation(() => { throw new Error("no service role"); });
    await expect(sendToHotel("hotel-1", payload)).resolves.toEqual({ sent: 0, removed: 0, failed: 0, skipped: 0 });
  });
});
