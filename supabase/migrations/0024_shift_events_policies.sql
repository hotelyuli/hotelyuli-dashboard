begin;
drop policy if exists shift_events_write on public.shift_events;
drop policy if exists shift_events_select on public.shift_events;
drop policy if exists shift_events_insert on public.shift_events;
drop policy if exists shift_events_update on public.shift_events;
drop policy if exists shift_events_delete on public.shift_events;
create policy shift_events_select on public.shift_events for select to authenticated
using (hotel_id = public.current_hotel_id());
create policy shift_events_insert on public.shift_events for insert to authenticated
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy shift_events_update on public.shift_events for update to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'))
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
create or replace function public.preserve_event_identity() returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  new.hotel_id := old.hotel_id;
  new.operation_date := old.operation_date;
  return new;
end;
$$;
drop trigger if exists shift_events_preserve_identity on public.shift_events;
create trigger shift_events_preserve_identity before update on public.shift_events
for each row execute function public.preserve_event_identity();
commit;
