begin;
create table public.shift_reports (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id),
  operation_date date not null,
  shift text not null check (shift in ('morning','afternoon','night')),
  receptionist text not null,
  final_report_en text not null check (length(final_report_en) between 20 and 16000),
  inputs jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','closed')),
  revision integer not null default 1,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hotel_id,operation_date,shift)
);
alter table public.shift_reports enable row level security;
create policy shift_reports_read on public.shift_reports for select to authenticated using (hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
create policy shift_reports_insert on public.shift_reports for insert to authenticated with check (hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by=auth.uid() and updated_by=auth.uid());
create policy shift_reports_update on public.shift_reports for update to authenticated using (hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and status='draft') with check (hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and updated_by=auth.uid());
create function public.guard_shift_report() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='UPDATE' then
    if OLD.status='closed' then raise exception 'Report already closed'; end if;
    if NEW.hotel_id<>OLD.hotel_id or NEW.operation_date<>OLD.operation_date or NEW.shift<>OLD.shift or NEW.created_by<>OLD.created_by then raise exception 'Report identity cannot change'; end if;
    if NEW.revision<>OLD.revision+1 then raise exception 'Invalid revision'; end if;
  end if;
  if NEW.status='closed' then
    if not (coalesce((NEW.inputs->>'eventsReviewed')::boolean,false) and coalesce((NEW.inputs->>'tasksReviewed')::boolean,false) and coalesce((NEW.inputs->>'handover')::boolean,false)) then raise exception 'Review required'; end if;
    if NEW.shift<>'morning' and not (coalesce((NEW.inputs->>'breakfastReviewed')::boolean,false) and coalesce((NEW.inputs->>'incomeReviewed')::boolean,false) and coalesce((NEW.inputs->>'cashReviewed')::boolean,false)) then raise exception 'Closing checklist required'; end if;
    NEW.closed_at=now();
  else NEW.closed_at=null;
  end if;
  return NEW;
end; $$;
create trigger shift_report_guard before insert or update on public.shift_reports for each row execute function public.guard_shift_report();
create trigger shift_reports_audit after insert or update on public.shift_reports for each row execute function public.log_audit_event();
commit;
