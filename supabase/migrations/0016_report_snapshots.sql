begin;
create table public.report_snapshots (
 id uuid primary key default gen_random_uuid(),
 hotel_id uuid not null references public.hotels(id),
 operation_date date not null,
 report_kind text not null check(report_kind in ('breakfast','housekeeping')),
 locale text not null check(locale in ('en','es')),
 report_text text not null check(length(report_text) between 1 and 50000),
 content_hash text not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(hotel_id,operation_date,report_kind,locale,content_hash)
);
alter table public.report_snapshots enable row level security;
create policy report_snapshots_read on public.report_snapshots for select to authenticated using(hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
create policy report_snapshots_insert on public.report_snapshots for insert to authenticated with check(hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by=auth.uid());
create trigger report_snapshots_audit after insert on public.report_snapshots for each row execute function public.log_audit_event();
commit;
