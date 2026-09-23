-- Repair the incident -> task sync. Self-contained and safe to re-run: it works
-- whether or not 0020 was fully applied live.
-- Rule (owner decision): an incident that is not completed has exactly one open
-- task; a completed incident never has an open task. requires_follow_up no
-- longer creates a task for a completed incident.
begin;

create unique index if not exists tasks_one_per_event
  on public.tasks (source_event_id) where source_event_id is not null;

create or replace function public.sync_event_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  linked_id uuid;
  linked_status text;
  actor uuid := coalesce(auth.uid(), new.created_by);
begin
  select t.id, t.status into linked_id, linked_status from public.tasks t where t.source_event_id = new.id;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'completed' then
    update public.tasks set status = 'completed', updated_at = now()
    where id = linked_id and status in ('open', 'in_progress');
  elsif linked_id is null then
    insert into public.tasks (hotel_id, operation_date, source_event_id, title, room_area, priority, status, created_by)
    values (new.hotel_id, new.operation_date, new.id, new.description, new.room_area, new.priority, 'open', actor)
    on conflict (source_event_id) where source_event_id is not null do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'completed' and linked_status in ('completed', 'cancelled') then
    update public.tasks set status = 'open', updated_at = now() where id = linked_id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_event_task() from public;
drop trigger if exists shift_events_sync_task on public.shift_events;
create trigger shift_events_sync_task after insert or update on public.shift_events
for each row execute function public.sync_event_task();

-- Backfill: every not-completed incident without a task gets one open task.
insert into public.tasks (hotel_id, operation_date, source_event_id, title, room_area, priority, status, created_by)
select e.hotel_id, e.operation_date, e.id, e.description, e.room_area, e.priority, 'open', e.created_by
from public.shift_events e
where e.status <> 'completed'
  and not exists (select 1 from public.tasks t where t.source_event_id = e.id)
on conflict (source_event_id) where source_event_id is not null do nothing;

-- Cleanup: completed incidents must not keep an open task. Close it (never
-- delete; the task stays in history as completed).
update public.tasks t set status = 'completed', updated_at = now()
from public.shift_events e
where t.source_event_id = e.id
  and e.status = 'completed'
  and t.status in ('open', 'in_progress');

commit;
