-- Incidents -> Tasks. Safe to re-run; does not depend on 0014 having run.
--  * Any owner/manager/reception user can edit/resolve any incident of their
--    hotel; incidents can never be deleted (permanent history).
--  * One task per incident (unique tasks.source_event_id).
--  * A trigger keeps the task in step with the incident inside the same
--    transaction as the incident write:
--      insert, not completed (or follow-up flagged) -> create its task
--      incident becomes completed                  -> close its open task
--      incident leaves completed                   -> reopen (or create) its task
--      task completed by hand                      -> incident untouched
begin;

-- Incidents: insert by the author, update by any reception user, no delete.
drop policy if exists shift_events_write on public.shift_events;
drop policy if exists shift_events_insert on public.shift_events;
drop policy if exists shift_events_update on public.shift_events;
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

-- Tasks: same rules as 0014 (idempotent here), so task edits by any reception user work.
drop policy if exists tasks_write on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by = auth.uid());
create policy tasks_update on public.tasks for update to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'))
with check (hotel_id = public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
create or replace function public.preserve_task_creator() returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;
drop trigger if exists tasks_preserve_creator on public.tasks;
create trigger tasks_preserve_creator before update on public.tasks
for each row execute function public.preserve_task_creator();

-- One task per incident. Should any incident already have two linked tasks,
-- keep the oldest linked and detach the rest (they stay in /tasks, unlinked).
update public.tasks t set source_event_id = null
where t.source_event_id is not null
  and exists (
    select 1 from public.tasks older
    where older.source_event_id = t.source_event_id
      and (older.created_at, older.id) < (t.created_at, t.id)
  );
create unique index if not exists tasks_one_per_event
  on public.tasks (source_event_id) where source_event_id is not null;

-- The sync trigger. SECURITY DEFINER so closing/reopening a task created by
-- another user never fails on task RLS; it only ever touches the task linked
-- to the incident row that already passed shift_events RLS.
create or replace function public.sync_event_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  linked_id uuid;
  linked_status text;
  actor uuid := coalesce(auth.uid(), new.created_by);
begin
  select t.id, t.status into linked_id, linked_status
  from public.tasks t where t.source_event_id = new.id;

  if tg_op = 'INSERT' then
    if new.status <> 'completed' or new.requires_follow_up then
      insert into public.tasks (hotel_id, operation_date, source_event_id, title, room_area, priority, status, created_by)
      values (new.hotel_id, new.operation_date, new.id, new.description, new.room_area, new.priority, 'open', actor)
      on conflict (source_event_id) where source_event_id is not null do nothing;
    end if;
    return new;
  end if;

  -- Updates only act when the incident's status actually changes, so editing
  -- notes never reopens a task that someone finished by hand.
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'completed' then
    update public.tasks set status = 'completed', updated_at = now()
    where id = linked_id and status in ('open', 'in_progress');
  elsif linked_id is null then
    insert into public.tasks (hotel_id, operation_date, source_event_id, title, room_area, priority, status, created_by)
    values (new.hotel_id, new.operation_date, new.id, new.description, new.room_area, new.priority, 'open', actor)
    on conflict (source_event_id) where source_event_id is not null do nothing;
  elsif old.status = 'completed' and linked_status in ('completed', 'cancelled') then
    update public.tasks set status = 'open', updated_at = now() where id = linked_id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_event_task() from public;
drop trigger if exists shift_events_sync_task on public.shift_events;
create trigger shift_events_sync_task after insert or update on public.shift_events
for each row execute function public.sync_event_task();

-- Backfill: every incident that should have a task but has none gets one
-- (e.g. logged after the app stopped creating tasks itself but before this ran).
insert into public.tasks (hotel_id, operation_date, source_event_id, title, room_area, priority, status, created_by)
select e.hotel_id, e.operation_date, e.id, e.description, e.room_area, e.priority, 'open', e.created_by
from public.shift_events e
where (e.status <> 'completed' or e.requires_follow_up)
  and not exists (select 1 from public.tasks t where t.source_event_id = e.id)
on conflict (source_event_id) where source_event_id is not null do nothing;

commit;
