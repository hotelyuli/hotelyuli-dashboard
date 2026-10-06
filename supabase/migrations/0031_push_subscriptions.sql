begin;
-- Web Push subscriptions (one row per browser/device that turned notifications on).
-- Users manage only their own rows; the senders (new incident, 08:00 digest) read
-- and prune rows with the service role, which bypasses RLS. No update policy.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  user_agent text null check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  last_success_at timestamptz null,
  failure_count int not null default 0
);
create index if not exists push_subscriptions_hotel_idx on public.push_subscriptions (hotel_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select on public.push_subscriptions;
drop policy if exists push_subscriptions_insert on public.push_subscriptions;
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid() and hotel_id = public.current_hotel_id() and public.current_app_role() is not null);
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and hotel_id = public.current_hotel_id() and public.current_app_role() is not null);
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid() and hotel_id = public.current_hotel_id() and public.current_app_role() is not null);
commit;
