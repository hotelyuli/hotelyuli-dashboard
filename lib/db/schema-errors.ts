/** PostgREST / Postgres codes for "this column / view / function does not exist yet". */
const MISSING = new Set(["42703", "42P01", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"]);

/** True when a query failed only because a migration that adds what it reads isn't applied yet. */
export const isMissingSchema = (error: { code?: string | null } | null | undefined) => Boolean(error?.code && MISSING.has(error.code));
