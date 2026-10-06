import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional()
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  // Validated by vapidEnv() at send time, so a bad value disables push instead of every page.
  VAPID_SUBJECT: z.string().optional()
});

export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined
  });
}

export function serverEnv() {
  return serverSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT || undefined
  });
}

const VAPID_ENV = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

/** Web Push (VAPID) config, or null with the names (never values) of what is missing. */
export function vapidEnv(env: NodeJS.ProcessEnv = process.env):
  | { ok: true; publicKey: string; privateKey: string; subject: string }
  | { ok: false; missing: string[] } {
  const missing = VAPID_ENV.filter((name) => !env[name]?.trim());
  if (env.VAPID_SUBJECT?.trim() && !env.VAPID_SUBJECT.trim().startsWith("mailto:")) missing.push("VAPID_SUBJECT");
  if (missing.length) return { ok: false, missing };
  return { ok: true, publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(), privateKey: env.VAPID_PRIVATE_KEY!.trim(), subject: env.VAPID_SUBJECT!.trim() };
}
