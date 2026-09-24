begin;
-- Edit / delete tours from Booked tours.
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

-- 2) A real delete only for a tour that never created income (not paid, and no
--    payment or reversal linked to it). Paid tours are cancelled instead (reversal).
drop policy if exists tour_bookings_delete on public.tour_bookings;
create policy tour_bookings_delete on public.tour_bookings for delete to authenticated
using (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() in ('owner', 'manager', 'reception')
  and status <> 'paid'
  and not exists (
    select 1 from public.income_entries i
    where i.hotel_id = tour_bookings.hotel_id and i.source_type = 'tour' and i.source_id = tour_bookings.id
  )
);
commit;
