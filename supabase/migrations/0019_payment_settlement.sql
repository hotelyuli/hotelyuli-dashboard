-- Paid -> Income settlement ledger (append-only).
-- A tour or a stay marked paid gets exactly one linked income payment row;
-- un-paying adds a reversal row that references it. Rows are never updated
-- or deleted. Safe to re-run.
begin;

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
