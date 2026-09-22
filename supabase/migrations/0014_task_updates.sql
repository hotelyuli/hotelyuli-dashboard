begin;
drop policy if exists tasks_write on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'))
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
create function public.preserve_task_creator() returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;
create trigger tasks_preserve_creator before update on public.tasks for each row execute function public.preserve_task_creator();
commit;
