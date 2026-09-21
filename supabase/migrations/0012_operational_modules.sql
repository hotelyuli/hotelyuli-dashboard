-- Operational records for shared hotel workflows and Google Sheets delivery.
create table public.shift_events (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  operation_date date not null,
  event_time time not null,
  category text not null check (category in ('arriving', 'departure', 'guest_request', 'guest_complaint', 'maintenance', 'security', 'other')),
  room_area text null,
  description text not null check (char_length(description) between 1 and 2000),
  action_taken text null,
  status text not null check (status in ('completed', 'temporary_solution', 'follow_up', 'open')),
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  requires_follow_up boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  operation_date date not null,
  source_event_id uuid null references public.shift_events(id) on delete set null,
  title text not null,
  room_area text null,
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  assigned_to text null,
  due_at timestamptz null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tour_bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  operation_date date not null,
  guest_name text not null,
  room_number text null,
  operator_name text not null,
  tour_name text not null,
  tour_date date not null,
  adults integer not null default 0 check (adults >= 0),
  children integer not null default 0 check (children >= 0),
  total_price numeric not null check (total_price >= 0),
  currency text not null check (currency in ('USD', 'CRC')),
  commission_amount numeric not null default 0 check (commission_amount >= 0),
  status text not null check (status in ('paid', 'pending', 'cancelled')),
  payment_method text null,
  receipt_number text null,
  booked_by text not null,
  notes text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.income_entries (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  operation_date date not null,
  room_number text null,
  guest_name text not null,
  paid boolean not null default true,
  category text not null,
  amount numeric not null check (amount >= 0),
  currency text not null check (currency in ('USD', 'CRC')),
  payment_method text not null,
  reference_note text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.google_sheets_outbox (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  entity_type text not null check (entity_type in ('tour', 'income')),
  entity_id uuid not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0,
  last_error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

alter table public.shift_events enable row level security;
alter table public.tasks enable row level security;
alter table public.tour_bookings enable row level security;
alter table public.income_entries enable row level security;
alter table public.google_sheets_outbox enable row level security;

create policy shift_events_select on public.shift_events for select to authenticated using (hotel_id = public.current_hotel_id());
create policy shift_events_write on public.shift_events for all to authenticated using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception')) with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy tasks_select on public.tasks for select to authenticated using (hotel_id = public.current_hotel_id());
create policy tasks_write on public.tasks for all to authenticated using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception')) with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy tour_bookings_select on public.tour_bookings for select to authenticated using (hotel_id = public.current_hotel_id());
create policy tour_bookings_write on public.tour_bookings for all to authenticated using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception')) with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy income_entries_select on public.income_entries for select to authenticated using (hotel_id = public.current_hotel_id());
create policy income_entries_write on public.income_entries for all to authenticated using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception')) with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy sheets_outbox_select on public.google_sheets_outbox for select to authenticated using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager'));
create policy sheets_outbox_insert on public.google_sheets_outbox for insert to authenticated with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));

create index shift_events_hotel_date_idx on public.shift_events (hotel_id, operation_date, event_time desc);
create index tasks_hotel_status_idx on public.tasks (hotel_id, operation_date, status);
create index tours_hotel_date_idx on public.tour_bookings (hotel_id, operation_date, created_at desc);
create index income_hotel_date_idx on public.income_entries (hotel_id, operation_date, created_at desc);
create index sheets_outbox_pending_idx on public.google_sheets_outbox (status, created_at) where status in ('pending','failed');

create trigger shift_events_audit after insert or update or delete on public.shift_events for each row execute function public.log_audit_event();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.log_audit_event();
create trigger tour_bookings_audit after insert or update or delete on public.tour_bookings for each row execute function public.log_audit_event();
create trigger income_entries_audit after insert or update or delete on public.income_entries for each row execute function public.log_audit_event();
