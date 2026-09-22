begin;
create table public.supplier_contacts (
 id uuid primary key default gen_random_uuid(),
 hotel_id uuid not null references public.hotels(id),
 name text not null check(length(name) between 1 and 120),
 category text not null check(category in ('maintenance','ac','pool','septic','supplies','tour','other')),
 phone text not null check(phone ~ '^[1-9][0-9]{7,14}$'),
 notes text not null default '' check(length(notes)<=500),
 operator_name text not null default '' check(length(operator_name)<=120),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index supplier_operator_unique on public.supplier_contacts(hotel_id,lower(trim(operator_name))) where operator_name<>'';
alter table public.supplier_contacts enable row level security;
create policy supplier_contacts_read on public.supplier_contacts for select to authenticated using(hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
create policy supplier_contacts_insert on public.supplier_contacts for insert to authenticated with check(hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception') and created_by=auth.uid());
create policy supplier_contacts_update on public.supplier_contacts for update to authenticated using(hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception')) with check(hotel_id=public.current_hotel_id() and public.current_app_role() in ('owner','manager','reception'));
create trigger supplier_contacts_audit after insert or update on public.supplier_contacts for each row execute function public.log_audit_event();
commit;
