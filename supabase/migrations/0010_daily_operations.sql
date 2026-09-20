create table public.daily_operations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  operation_date date not null,
  room_id uuid not null references public.rooms(id) on delete restrict,
  reservation_id uuid null references public.reservations(id) on delete set null,
  guest_name text null,
  adults integer not null default 0,
  children integer not null default 0,
  babies integer not null default 0,
  total_pax integer not null default 0,
  arrival_date date null,
  departure_date date null,
  operational_status text not null check (operational_status in ('check_in', 'staying', 'available', 'out_of_service')),
  breakfast_status text not null default 'not_included' check (breakfast_status in ('included', 'not_included')),
  breakfast_pax integer not null default 0,
  breakfast_to_go boolean not null default false,
  breakfast_notes text null,
  payment_status text null,
  outstanding_balance numeric null,
  currency text null check (currency in ('USD', 'CRC')),
  car_plate text null,
  booking_channel text null,
  notes text null,
  housekeeping_category text null check (housekeeping_category in ('priority', 'vacant_after_departure', 'remains_occupied')),
  same_day_arrival boolean not null default false,
  manually_modified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, operation_date, room_id)
);

alter table public.daily_operations enable row level security;

create policy daily_operations_select_same_tenant
on public.daily_operations for select to authenticated
using (hotel_id = public.current_hotel_id());

create policy daily_operations_insert_operations
on public.daily_operations for insert to authenticated
with check (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
);

create policy daily_operations_update_operations
on public.daily_operations for update to authenticated
using (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
)
with check (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
);

create index daily_operations_hotel_date_idx
on public.daily_operations (hotel_id, operation_date);

comment on table public.daily_operations is
  'Per-date, per-room operational board cell. Materialized from reservations on import; manual edits are protected by manually_modified.';
