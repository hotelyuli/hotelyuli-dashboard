create table public.reservation_imports (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  operation_date date not null,
  file_type text not null check (file_type in ('check_in', 'check_out')),
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_hash text not null check (char_length(content_hash) = 64),
  row_count integer not null check (row_count between 0 and 2000),
  headers text[] not null,
  rows jsonb not null,
  imported_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (hotel_id, operation_date, file_type, content_hash)
);

alter table public.reservation_imports enable row level security;

create policy reservation_imports_select_same_tenant
on public.reservation_imports for select to authenticated
using (hotel_id = public.current_hotel_id());

create policy reservation_imports_insert_operations
on public.reservation_imports for insert to authenticated
with check (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
  and imported_by = auth.uid()
);

create index reservation_imports_hotel_date_idx
on public.reservation_imports (hotel_id, operation_date desc, created_at desc);

comment on table public.reservation_imports is
  'Append-only record of Little Hotelier daily CSV imports, preserving the normalized source rows.';
