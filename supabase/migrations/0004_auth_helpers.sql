create or replace function public.current_hotel_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.hotel_id from public.profiles p
  where p.id = auth.uid() and p.active = true
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.active = true
$$;

revoke all on function public.current_hotel_id() from public;
revoke all on function public.current_app_role() from public;
grant execute on function public.current_hotel_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
