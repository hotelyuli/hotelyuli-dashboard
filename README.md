# YuliOS

Hotel Yuli Operating System is the daily operational layer above Little
Hotelier. It is not a PMS.

## Module status

Module 1 is implemented: project foundation, authentication surface,
multi-tenant identity schema, RLS foundation, protected application shell and
permission primitives.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your Supabase project URL and anon key to `.env.local` before opening the
protected application.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

See `docs/module-01-foundation.md` for scope, decisions and the approval gate.
