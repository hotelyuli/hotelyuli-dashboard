import { unstable_rethrow } from "next/navigation";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Next.js replaces thrown server-action messages with a generic digest in
 * production, so the UI could only ever say "SAVE_FAILED". Run the action,
 * let Next's own redirect/notFound errors through, log the real error to the
 * server (Vercel function logs), and return it so the UI can show it.
 */
export async function runAction(name: string, action: () => Promise<void>): Promise<ActionResult> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${name}] failed: ${message}`, error);
    return { ok: false, error: message };
  }
}
