create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  reference text null,
  guest_name text null,
  room_id uuid not null references public.rooms(id) on delete restrict,
  arrival_date date not null,
  departure_date date not null,
  adults integer not null default 0 check (adults >= 0),
  children integer not null default 0 check (children >= 0),
  babies integer not null default 0 check (babies >= 0),
  total_amount numeric null,
  outstanding_balance numeric null,
  currency text null check (currency in ('USD', 'CRC')),
  booking_channel text null,
  notes text null,
  source_import_id uuid null references public.reservation_imports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (departure_date > arrival_date),
  unique (hotel_id, reference, arrival_date, room_id)
);

alter table public.reservations enable row level security;

create policy reservations_select_same_tenant
on public.reservations for select to authenticated
using (hotel_id = public.current_hotel_id());

create policy reservations_insert_operations
on public.reservations for insert to authenticated
with check (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
);

create policy reservations_update_operations
on public.reservations for update to authenticated
using (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
)
with check (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
);

create index reservations_hotel_room_dates_idx
on public.reservations (hotel_id, room_id, arrival_date, departure_date);

comment on table public.reservations is
  'Durable stay record populated from check-in imports; the source of truth the daily board is derived from.';
