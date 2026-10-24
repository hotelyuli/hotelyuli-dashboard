import type { PGlite } from "@electric-sql/pglite";

/**
 * Test-only: the part of the supabase-js client the app uses, executed on PGlite as a given user
 * with RLS on (role authenticated, auth.uid() from test.uid), issuing the SQL PostgREST would.
 * Supports from().select/insert/update/upsert with eq / in / lte / gte / is / or ("col.not.is.null",
 * "col.eq.value"), order, single / maybeSingle, { count, head } and rpc(name, namedArgs).
 */
/** Like PostgREST: a list of strings is a Postgres array (uuid[] / text[]); other objects are jsonb. */
const toParam = (value: unknown) => (Array.isArray(value) && value.every((item) => typeof item === "string") ? value : typeof value === "object" && value !== null ? JSON.stringify(value) : value);

type Filter = { sql: (index: number) => string; value?: unknown; hasValue: boolean };
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

export function pgClient(db: PGlite, userId: string) {
  const run = async (sql: string, params: unknown[]) => {
    await db.exec(`select set_config('test.uid', '${userId}', false); set role authenticated;`);
    try { return (await db.query<Record<string, unknown>>(sql, params)).rows; } finally { await db.exec("reset role;"); }
  };
  const fail = (error: unknown): Result => ({ data: null, error: { message: (error as Error).message, code: (error as { code?: string }).code } });

  return {
    async rpc(name: string, args: Record<string, unknown>): Promise<Result> {
      const keys = Object.keys(args).filter((key) => args[key] !== undefined);
      try {
        const rows = await run(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as r`, keys.map((key) => toParam(args[key])));
        return { data: rows[0].r, error: null };
      } catch (error) { return fail(error); }
    },
    from(table: string) {
      const filters: Filter[] = [];
      let op: "select" | "update" | "insert" = "select";
      let values: Record<string, unknown> = {};
      let columns = "*";
      let mode: "many" | "single" | "maybe" = "many";
      let head = false;
      const add = (sql: (index: number) => string, value?: unknown, hasValue = true) => { filters.push({ sql, value, hasValue }); return query; };
      const where = (offset: number) => {
        const params: unknown[] = [];
        const clauses = filters.map((filter) => {
          if (!filter.hasValue) return filter.sql(0);
          params.push(filter.value);
          return filter.sql(offset + params.length);
        });
        return { sql: clauses.length ? ` where ${clauses.join(" and ")}` : "", params };
      };
      const exec = async (): Promise<Result> => {
        try {
          let rows: Record<string, unknown>[];
          if (op === "select") {
            const w = where(0);
            rows = await run(`select ${columns} from public.${table}${w.sql}`, w.params);
          } else {
            const keys = Object.keys(values);
            const w = where(keys.length);
            rows = op === "update"
              ? await run(`update public.${table} set ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")}${w.sql} returning ${columns === "*" ? "id" : columns}`, [...keys.map((k) => values[k]), ...w.params])
              : await run(`insert into public.${table} (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning ${columns === "*" ? "id" : columns}`, keys.map((k) => values[k]));
          }
          if (head) return { data: null, error: null, count: rows.length };
          if (mode === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
          if (mode === "maybe") return { data: rows[0] ?? null, error: null };
          return { data: rows, error: null, count: rows.length };
        } catch (error) { return fail(error); }
      };
      const query = {
        select(cols = "*", options?: { head?: boolean }) { columns = cols; head = Boolean(options?.head); return query; },
        eq: (col: string, value: unknown) => add((i) => `${col} = $${i}`, value),
        lt: (col: string, value: unknown) => add((i) => `${col} < $${i}`, value),
        lte: (col: string, value: unknown) => add((i) => `${col} <= $${i}`, value),
        gte: (col: string, value: unknown) => add((i) => `${col} >= $${i}`, value),
        in: (col: string, value: unknown[]) => add((i) => `${col} = any($${i})`, value),
        is: (col: string, value: null) => add(() => `${col} is ${value === null ? "null" : "not null"}`, undefined, false),
        or: (expression: string) => add(() => `(${expression.split(",").map((part) => {
          const [col, ...rest] = part.split(".");
          const operator = rest.join(".");
          if (operator === "not.is.null") return `${col} is not null`;
          if (operator === "is.null") return `${col} is null`;
          if (operator.startsWith("eq.")) return `${col} = '${operator.slice(3).replace(/'/g, "''")}'`;
          throw new Error(`unsupported or(): ${part}`);
        }).join(" or ")})`, undefined, false),
        order: () => query,
        update(next: Record<string, unknown>) { op = "update"; values = next; return query; },
        insert(next: Record<string, unknown>) { op = "insert"; values = next; return query; },
        single() { mode = "single"; return exec(); },
        maybeSingle() { mode = "maybe"; return exec(); },
        then(resolve: (value: Result) => void, reject: (error: unknown) => void) { exec().then(resolve, reject); },
        async upsert(input: Record<string, unknown> | Record<string, unknown>[], options: { onConflict: string }): Promise<Result> {
          try {
            for (const row of Array.isArray(input) ? input : [input]) {
              const keys = Object.keys(row);
              const conflict = options.onConflict.split(",");
              await run(`insert into public.${table} (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})
                on conflict (${conflict.join(", ")}) do update set ${keys.filter((k) => !conflict.includes(k)).map((k) => `${k} = excluded.${k}`).join(", ")}`, keys.map((k) => row[k]));
            }
            return { data: null, error: null };
          } catch (error) { return fail(error); }
        }
      };
      return query;
    }
  };
}
