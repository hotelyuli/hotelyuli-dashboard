-- Paid -> Income settlement ledger (append-only).
-- A tour or a stay marked paid gets exactly one linked income payment row;
-- un-paying adds a reversal row that references it. Rows are never updated
-- or deleted.
--
-- The app's only income table is public.income_entries (created by 0012).
-- Part 1 creates it -- and the Sheets outbox the income code also writes to --
-- with the exact 0012 definitions when they are missing, so this migration
-- works whether or not 0012 was applied live. Safe to re-run.
begin;

-- Part 1: base tables (no-ops when 0012 is already live) -------------------
create table if not exists public.income_entries (
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

create table if not exists public.google_sheets_outbox (
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

alter table public.income_entries enable row level security;
alter table public.google_sheets_outbox enable row level security;

drop policy if exists income_entries_select on public.income_entries;
create policy income_entries_select on public.income_entries for select to authenticated
using (hotel_id = public.current_hotel_id());

drop policy if exists sheets_outbox_select on public.google_sheets_outbox;
create policy sheets_outbox_select on public.google_sheets_outbox for select to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager'));
drop policy if exists sheets_outbox_insert on public.google_sheets_outbox;
create policy sheets_outbox_insert on public.google_sheets_outbox for insert to authenticated
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));

create index if not exists income_hotel_date_idx on public.income_entries (hotel_id, operation_date, created_at desc);
create index if not exists sheets_outbox_pending_idx on public.google_sheets_outbox (status, created_at) where status in ('pending','failed');

drop trigger if exists income_entries_audit on public.income_entries;
create trigger income_entries_audit after insert or update or delete on public.income_entries
for each row execute function public.log_audit_event();

-- Part 2: settlement ledger columns and rules -------------------------------
alter table public.income_entries
  add column if not exists entry_type text not null default 'payment',
  add column if not exists source_type text null,
  add column if not exists source_id uuid null,
  add column if not exists settlement_seq integer null,
  add column if not exists reverses_entry_id uuid null references public.income_entries(id) on delete restrict,
  add column if not exists reason text null;

alter table public.income_entries drop constraint if exists income_entries_entry_type_check;
alter table public.income_entries add constraint income_entries_entry_type_check
  check (entry_type in ('payment', 'reversal'));

alter table public.income_entries drop constraint if exists income_entries_source_check;
alter table public.income_entries add constraint income_entries_source_check
  check (
    (source_type is null and source_id is null and settlement_seq is null)
    or (source_type in ('tour', 'accommodation') and source_id is not null and settlement_seq >= 1)
  );

alter table public.income_entries drop constraint if exists income_entries_reversal_check;
alter table public.income_entries add constraint income_entries_reversal_check
  check (
    (entry_type = 'payment' and reverses_entry_id is null and reason is null)
    or (entry_type = 'reversal' and reverses_entry_id is not null and char_length(trim(reason)) between 1 and 500)
  );

-- Idempotency: one payment per settlement cycle, one reversal per payment.
create unique index if not exists income_entries_settlement_unique
  on public.income_entries (hotel_id, source_type, source_id, entry_type, settlement_seq)
  where source_type is not null;
create unique index if not exists income_entries_one_reversal
  on public.income_entries (reverses_entry_id)
  where reverses_entry_id is not null;
create index if not exists income_entries_source_idx
  on public.income_entries (hotel_id, source_type, source_id);

-- Income is append-only: insert, never update or delete.
drop policy if exists income_entries_write on public.income_entries;
drop policy if exists income_entries_insert on public.income_entries;
create policy income_entries_insert on public.income_entries for insert to authenticated
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());

-- Tours: any reception user may change the status (mark paid / cancel);
-- bookings can no longer be deleted and keep their original author.
drop policy if exists tour_bookings_write on public.tour_bookings;
drop policy if exists tour_bookings_insert on public.tour_bookings;
drop policy if exists tour_bookings_update on public.tour_bookings;
create policy tour_bookings_insert on public.tour_bookings for insert to authenticated
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy tour_bookings_update on public.tour_bookings for update to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'))
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));

create or replace function public.preserve_tour_creator() returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;
drop trigger if exists tour_bookings_preserve_creator on public.tour_bookings;
create trigger tour_bookings_preserve_creator before update on public.tour_bookings for each row execute function public.preserve_tour_creator();

commit;
