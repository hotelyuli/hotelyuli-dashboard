begin;
-- Tours are never deleted. A tour can be hidden from Booked tours only after it is
-- cancelled; it stays in tour_bookings, keeps its income link (the cancellation's
-- reversal) and stays in the Google Sheet.
alter table public.tour_bookings
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_at timestamptz null;
alter table public.tour_bookings drop constraint if exists tour_bookings_hidden_only_cancelled;
alter table public.tour_bookings add constraint tour_bookings_hidden_only_cancelled
  check (not hidden or status = 'cancelled');
create index if not exists tours_hotel_date_visible_idx on public.tour_bookings (hotel_id, tour_date) where not hidden;
-- No hard delete of tours for any app user (removes the policy an earlier 0029 draft created).
drop policy if exists tour_bookings_delete on public.tour_bookings;
commit;
