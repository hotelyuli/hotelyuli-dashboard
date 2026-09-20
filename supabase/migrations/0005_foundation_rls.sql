alter table public.hotels enable row level security;
alter table public.profiles enable row level security;

create policy hotels_select_same_tenant
on public.hotels for select to authenticated
using (id = public.current_hotel_id());

create policy hotels_owner_update
on public.hotels for update to authenticated
using (id = public.current_hotel_id() and public.current_app_role() = 'owner')
with check (id = public.current_hotel_id() and public.current_app_role() = 'owner');

create policy profiles_select_self_or_management
on public.profiles for select to authenticated
using (
  hotel_id = public.current_hotel_id()
  and (id = auth.uid() or public.current_app_role() in ('owner', 'manager'))
);

create policy profiles_owner_insert
on public.profiles for insert to authenticated
with check (
  hotel_id = public.current_hotel_id()
  and public.current_app_role() = 'owner'
);

create policy profiles_owner_update
on public.profiles for update to authenticated
using (hotel_id = public.current_hotel_id() and public.current_app_role() = 'owner')
with check (hotel_id = public.current_hotel_id() and public.current_app_role() = 'owner');

-- Self-service name changes are intentionally handled through a dedicated
-- SECURITY DEFINER function in a later staff module; clients cannot alter roles.
