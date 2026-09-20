-- Run only after creating the owner in Supabase Auth.
-- Replace OWNER_AUTH_USER_ID before execution.
insert into public.hotels (id, name, slug, timezone)
values ('11111111-1111-4111-8111-111111111111', 'Hotel Yuli', 'hotel-yuli', 'America/Costa_Rica')
on conflict (slug) do nothing;

select public.seed_default_rooms('11111111-1111-4111-8111-111111111111');

-- Example (uncomment after replacing the UUID):
-- insert into public.profiles (id, hotel_id, full_name, role)
-- values ('OWNER_AUTH_USER_ID', '11111111-1111-4111-8111-111111111111', 'Yusrei Jamil', 'owner');
