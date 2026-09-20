# Module 1 — Foundation and authentication

## Scope completed

- Next.js 16 App Router with strict TypeScript and Tailwind CSS.
- Hotel Yuli visual tokens and responsive login/dashboard shell.
- Supabase browser/server clients and session-refresh proxy.
- Server-side login/logout actions with Spanish validation errors.
- Server-authoritative role/capability guard primitives.
- Multi-tenant `hotels` and `profiles` schema with RLS enabled.
- Initial seed instructions and generated-type placeholder.
- Unit coverage for the application permission matrix.

## Deliberately deferred

CSV import, rooms, operations, breakfast, housekeeping, events, tasks, tours,
income, shift close, audit triggers and real shift-report generation are not part
of Module 1. Navigation labels are visible to validate the product shell but
remain inactive.

## Architecture decisions and assumptions

1. Document 2 is authoritative. Prisma is excluded.
2. Next.js 16 is used because it is the current stable major. Its `proxy.ts`
   convention replaces the deprecated `middleware.ts` convention.
3. The proposed migration order placed RLS policies before the helper functions
   they call. The foundation therefore creates `current_hotel_id()` and
   `current_app_role()` in `0004_auth_helpers.sql`, before policies in `0005`.
4. `SUPABASE_SERVICE_ROLE_KEY` is documented but is never imported into a Client
   Component. Module 1 does not need it at runtime.
5. User creation is performed in Supabase Auth first. The matching profile row
   is created by a trusted administration path; public self-registration is not
   exposed.
6. Server actions and RLS are both authorization boundaries. UI navigation is
   presentation only.

## Approval gate

After approval, Module 2 will add rooms, daily operations, the two-file Little
Hotelier CSV parser/preview/validation pipeline, deterministic status logic and
the first real operational dashboard.
