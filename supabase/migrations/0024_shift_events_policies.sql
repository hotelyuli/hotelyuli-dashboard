begin;
drop policy if exists shift_events_write on public.shift_events;
drop policy if exists shift_events_insert on public.shift_events;
drop policy if exists shift_events_update on public.shift_events;
drop policy if exists shift_events_delete on public.shift_events;
create policy shift_events_insert on public.shift_events for insert to authenticated
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy shift_events_update on public.shift_events for update to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'))
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
commit;
