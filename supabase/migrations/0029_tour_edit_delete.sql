begin;
-- Edit tours from Booked tours (tours are never hard-deleted; cancelled tours can be hidden, 0030).
-- 1) Any change to a field exported to the Tours sheet (not only status, as in 0027)
--    re-queues the tour, and so does a delete (the export then clears its sheet row).
create or replace function public.requeue_tour_for_sheets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.google_sheets_outbox
    set status = 'pending', attempt_count = 0, last_error = null, claimed_at = null
    where entity_type = 'tour' and entity_id = old.id and status in ('sent', 'failed', 'pending', 'sending');
    return old;
  end if;
  if (new.status, new.tour_date, new.operator_name, new.tour_name, new.guest_name, new.adults, new.children, new.total_price, new.commission_amount, new.currency, new.booked_by)
     is distinct from
     (old.status, old.tour_date, old.operator_name, old.tour_name, old.guest_name, old.adults, old.children, old.total_price, old.commission_amount, old.currency, old.booked_by) then
    update public.google_sheets_outbox
    set status = 'pending', attempt_count = 0, last_error = null, claimed_at = null
    where entity_type = 'tour' and entity_id = new.id and status in ('sent', 'failed', 'pending', 'sending');
  end if;
  return new;
end;
$$;
revoke all on function public.requeue_tour_for_sheets() from public;
drop trigger if exists tour_bookings_requeue_sheets on public.tour_bookings;
create trigger tour_bookings_requeue_sheets after update or delete on public.tour_bookings
for each row execute function public.requeue_tour_for_sheets();
commit;
