create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid null references public.profiles(id) on delete set null,
  diff jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy audit_log_select_same_tenant
on public.audit_log for select to authenticated
using (hotel_id = public.current_hotel_id());

-- No insert/update/delete policy for authenticated: rows are written only by the
-- SECURITY DEFINER trigger below, which bypasses RLS as its owning role does.
-- Append-only by construction: no delete policy exists at all.

create index audit_log_hotel_record_idx
on public.audit_log (hotel_id, table_name, record_id, created_at desc);

comment on table public.audit_log is
  'Append-only change history, written by generic per-table triggers. Starts on daily_operations in Module 2; extends to other tables in Module 4.';

-- Generic audit trigger function: attach to any table that has hotel_id and id
-- columns to get change history for free.
create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row record;
  action_name text;
  diff_payload jsonb;
begin
  if tg_op = 'DELETE' then
    action_name := 'delete';
    changed_row := old;
    diff_payload := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'UPDATE' then
    action_name := 'update';
    changed_row := new;
    diff_payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  else
    action_name := 'insert';
    changed_row := new;
    diff_payload := jsonb_build_object('new', to_jsonb(new));
  end if;

  insert into public.audit_log (hotel_id, table_name, record_id, action, actor_id, diff)
  values (changed_row.hotel_id, tg_table_name, changed_row.id, action_name, auth.uid(), diff_payload);

  return changed_row;
end;
$$;

revoke all on function public.log_audit_event() from public;
revoke all on function public.log_audit_event() from authenticated;

create trigger daily_operations_audit
after insert or update or delete on public.daily_operations
for each row execute function public.log_audit_event();
