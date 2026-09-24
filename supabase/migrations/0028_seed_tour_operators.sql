begin;
-- Tour operators live in the Supplier directory (category 'tour'); the Register tour
-- dropdown reads them from there. Re-running is safe: an operator that already exists
-- (same linked operator name, case/spaces ignored) gets this name and phone instead of a duplicate.
insert into public.supplier_contacts (hotel_id, name, category, phone, notes, operator_name)
select h.id, v.name, 'tour', v.phone, '', v.name
from public.hotels h
cross join (values
  ('Ballena Tour', '50687292020'),
  ('Costa Rica Dive and Surf', '50684784848'),
  ('Ronald Tour De Chocolate Playa Hermosa', '50688814996'),
  ('Dolphin Tours', '50688543022'),
  ('Jimena Professional Surf Lesson', '50687813221'),
  ('Osa Canopy Tour', '50688841237')
) as v(name, phone)
where h.active
on conflict (hotel_id, lower(trim(operator_name))) where operator_name <> ''
do update set name = excluded.name, operator_name = excluded.operator_name, category = 'tour', phone = excluded.phone, updated_at = now();
commit;
