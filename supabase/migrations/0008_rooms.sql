create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  unit_code text not null check (char_length(unit_code) between 1 and 10),
  display_name text not null,
  room_number text not null,
  unit_type text not null check (unit_type in ('room', 'bunk')),
  parent_room_number text null,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (hotel_id, unit_code)
);

alter table public.rooms enable row level security;

create policy rooms_select_same_tenant
on public.rooms for select to authenticated
using (hotel_id = public.current_hotel_id());

create policy rooms_owner_insert
on public.rooms for insert to authenticated
with check (hotel_id = public.current_hotel_id() and public.current_app_role() = 'owner');

create policy rooms_owner_update
on public.rooms for update to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() = 'owner')
with check (hotel_id = public.current_hotel_id() and public.current_app_role() = 'owner');

create index rooms_hotel_sort_idx on public.rooms (hotel_id, sort_order);

comment on table public.rooms is
  'The 25 operational units per hotel: rooms 1-19 and bunks B1-B6 under Room 20.';

-- Idempotent seeding for a newly provisioned hotel. Safe to call more than once.
create or replace function public.seed_default_rooms(target_hotel_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.rooms (hotel_id, unit_code, display_name, room_number, unit_type, parent_room_number, sort_order)
  select
    target_hotel_id,
    n::text,
    'Habitación ' || n,
    n::text,
    'room',
    null,
    n
  from generate_series(1, 19) as n
  union all
  select
    target_hotel_id,
    'B' || n,
    'Cama ' || n,
    '20',
    'bunk',
    '20',
    100 + n
  from generate_series(1, 6) as n
  on conflict (hotel_id, unit_code) do nothing;
$$;

-- Provisioning-only: called via the service role (seed script / admin tooling),
-- never exposed to application roles, since it takes an arbitrary target_hotel_id.
revoke all on function public.seed_default_rooms(uuid) from public;
revoke all on function public.seed_default_rooms(uuid) from authenticated;
