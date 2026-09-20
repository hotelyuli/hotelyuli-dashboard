create table public.daily_staff_assignments (
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  operation_date date not null,
  morning_receptionist text not null check (char_length(morning_receptionist) between 2 and 120),
  afternoon_receptionist text not null check (char_length(afternoon_receptionist) between 2 and 120),
  security_guard text not null check (char_length(security_guard) between 2 and 120),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (hotel_id, operation_date)
);

alter table public.daily_staff_assignments enable row level security;

create policy daily_staff_select_same_tenant
on public.daily_staff_assignments for select to authenticated
using (hotel_id = public.current_hotel_id());

create policy daily_staff_insert_operations
on public.daily_staff_assignments for insert to authenticated
with check (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
  and updated_by = auth.uid()
);

create policy daily_staff_update_operations
on public.daily_staff_assignments for update to authenticated
using (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
)
with check (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
  and updated_by = auth.uid()
);

create index daily_staff_assignments_date_idx
on public.daily_staff_assignments (hotel_id, operation_date desc);

comment on table public.daily_staff_assignments is
  'One shared reception and security assignment per hotel operating date.';
