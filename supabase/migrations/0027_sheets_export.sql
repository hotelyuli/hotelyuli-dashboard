begin;
alter table public.google_sheets_outbox drop constraint if exists google_sheets_outbox_status_check;
alter table public.google_sheets_outbox add constraint google_sheets_outbox_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped'));
alter table public.google_sheets_outbox
  add column if not exists claimed_at timestamptz null,
  add column if not exists sheet_range text null,
  add column if not exists sheet_values jsonb null;
update public.google_sheets_outbox
set status = 'skipped', last_error = 'BACKLOG: queued before the export start (2026-09-24)'
where status in ('pending', 'failed') and created_at < timestamptz '2026-09-24 00:00:00-06';
create or replace function public.requeue_tour_for_sheets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    update public.google_sheets_outbox
    set status = 'pending', attempt_count = 0, last_error = null, claimed_at = null
    where entity_type = 'tour' and entity_id = new.id and status in ('sent', 'failed', 'pending', 'sending');
  end if;
  return new;
end;
$$;
revoke all on function public.requeue_tour_for_sheets() from public;
drop trigger if exists tour_bookings_requeue_sheets on public.tour_bookings;
create trigger tour_bookings_requeue_sheets after update on public.tour_bookings
for each row execute function public.requeue_tour_for_sheets();
commit;
