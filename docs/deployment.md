# Deployment — Module 1

1. Create a Supabase project in the closest suitable region.
2. Copy `.env.example` to `.env.local` and add the project URL and anon key.
3. Link the Supabase CLI and apply the migrations in order.
4. Create the first owner in Supabase Authentication.
5. Run `supabase/seed/seed.sql` after replacing the owner UUID in the commented
   profile insert.
6. Regenerate database types:

   `supabase gen types typescript --linked > lib/db/database.types.ts`

7. Import the repository into Vercel and configure the same environment values.
8. Keep the service-role key server-only. It is not required by the Module 1 UI.
