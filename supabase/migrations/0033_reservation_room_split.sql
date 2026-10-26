-- 0033_reservation_room_split.sql  (deployment 2)
-- Requires 0032_reservation_retirement.sql: splits only ever count active reservation rows, never a
-- retired or moved-in-LH one.
begin;
do $$
begin
  if to_regclass('public.active_reservations') is null then
    raise exception '0033 requires 0032_reservation_retirement.sql to be applied first';
  end if;
end;
$$;
-- A Little Hotelier reservation that spans several rooms (e.g. "Room 14,Room 18") is imported
-- as one reservations row per room, each carrying the reservation's TOTAL pax. Staff set the
-- real per-room split here. The import's upsert never sends these columns, so on conflict it
-- leaves them untouched: a split survives every re-import and is never silently reverted.
alter table public.reservations
  add column if not exists split_adults integer null,
  add column if not exists split_children integer null,
  add column if not exists split_babies integer null,
  add column if not exists split_set_by uuid null references public.profiles(id) on delete set null,
  add column if not exists split_set_at timestamptz null,
  -- The reservation's total pax when the split was saved: if LH later changes it, the split no
  -- longer adds up and the board shows "repartir de nuevo".
  add column if not exists split_for_pax integer null,
  -- Breakfast for the whole reservation, chosen in the split dialog (null = follow the LH notes).
  -- The import's board rebuild uses it, so a re-import doesn't drop the breakfast of the group.
  add column if not exists split_breakfast boolean null;

-- 0032's active_reservations is "select *" and was frozen with the columns of that moment:
-- recreate it (same definition) so it also returns the split columns added above. Recreate it
-- again whenever reservations gets new columns.
create or replace view public.active_reservations with (security_invoker = true) as
  select * from public.reservations where retired_at is null and review_flag is null;

alter table public.reservations drop constraint if exists reservations_split_check;
alter table public.reservations add constraint reservations_split_check check (
  (split_adults is null and split_children is null and split_babies is null)
  or (split_adults >= 0 and split_children >= 0 and split_babies >= 0)
);

-- Saves the whole split of one reservation in one transaction: every room of the reservation
-- exactly once, and the per-room adults / children / babies adding up to the reservation's. The
-- board rows of the stay (every day already on the board) take the per-room pax, and their
-- breakfast covers follow it (adults + children) when breakfast is included.
-- p_split: [{"room_id": "<uuid>", "adults": 2, "children": 0, "babies": 0}, ...]
-- p_breakfast: true / false = breakfast included / not for every room of the reservation;
--              null = each board row keeps its own breakfast status.
create or replace function public.set_reservation_split(p_reference text, p_arrival date, p_split jsonb, p_breakfast boolean default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_hotel uuid := public.current_hotel_id();
  v_rooms int;
  v_adults int;
  v_children int;
  v_babies int;
  v_sum record;
begin
  -- Same roles that edit the Room board today (RLS on reservations / daily_operations as well).
  if v_hotel is null or public.current_app_role() not in ('owner', 'manager', 'reception') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reference, '')), '') is null or p_arrival is null or jsonb_typeof(p_split) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;

  perform 1 from public.reservations r
   where r.hotel_id = v_hotel and trim(r.reference) = trim(p_reference) and r.arrival_date = p_arrival
     and r.id in (select a.id from public.active_reservations a)
   for update;
  select count(*), max(r.adults), max(r.children), max(r.babies) into v_rooms, v_adults, v_children, v_babies
    from public.active_reservations r
   where r.hotel_id = v_hotel and trim(r.reference) = trim(p_reference) and r.arrival_date = p_arrival;
  if v_rooms < 2 then raise exception 'NOT_MULTI_ROOM'; end if;

  -- Every room of the reservation exactly once, nothing else, no negative numbers.
  if jsonb_array_length(p_split) <> v_rooms
     or (select count(distinct x.room_id) from jsonb_to_recordset(p_split) as x(room_id uuid)) <> v_rooms
     or exists (
       select 1 from jsonb_to_recordset(p_split) as x(room_id uuid, adults int, children int, babies int)
        where x.adults is null or x.children is null or x.babies is null
           or x.adults < 0 or x.children < 0 or x.babies < 0
           or not exists (select 1 from public.active_reservations r
                           where r.hotel_id = v_hotel and trim(r.reference) = trim(p_reference)
                             and r.arrival_date = p_arrival and r.room_id = x.room_id)) then
    raise exception 'SPLIT_ROOMS: give every room of the reservation once, with 0 or more pax';
  end if;
  -- Adults, children and babies each add up (breakfast covers count adults + children).
  select sum(x.adults) as adults, sum(x.children) as children, sum(x.babies) as babies into v_sum
    from jsonb_to_recordset(p_split) as x(room_id uuid, adults int, children int, babies int);
  if v_sum.adults <> v_adults or v_sum.children <> v_children or v_sum.babies <> v_babies then
    raise exception 'SPLIT_SUM: % / % / % repartidos, la reserva tiene % / % / %',
      v_sum.adults, v_sum.children, v_sum.babies, v_adults, v_children, v_babies;
  end if;

  update public.reservations r set
    split_adults = x.adults, split_children = x.children, split_babies = x.babies,
    split_for_pax = v_adults + v_children + v_babies, split_breakfast = p_breakfast,
    split_set_by = auth.uid(), split_set_at = now(), updated_at = now()
  from jsonb_to_recordset(p_split) as x(room_id uuid, adults int, children int, babies int)
  where r.hotel_id = v_hotel and trim(r.reference) = trim(p_reference) and r.arrival_date = p_arrival
    and r.room_id = x.room_id and r.id in (select a.id from public.active_reservations a);

  update public.daily_operations d set
    adults = x.adults, children = x.children, babies = x.babies,
    total_pax = x.adults + x.children + x.babies,
    breakfast_status = case when p_breakfast is null then d.breakfast_status when p_breakfast then 'included' else 'not_included' end,
    breakfast_pax = case
      when coalesce(p_breakfast, d.breakfast_status = 'included') then x.adults + x.children
      when p_breakfast = false then 0
      else d.breakfast_pax end,
    updated_at = now()
  from public.active_reservations r
  join jsonb_to_recordset(p_split) as x(room_id uuid, adults int, children int, babies int) on x.room_id = r.room_id
  where d.hotel_id = v_hotel and d.reservation_id = r.id
    and r.hotel_id = v_hotel and trim(r.reference) = trim(p_reference) and r.arrival_date = p_arrival;

  return jsonb_build_object('rooms', v_rooms, 'pax', v_adults + v_children + v_babies);
end;
$$;

-- Splits that no longer add up: LH changed the reservation's pax after the split, or added a
-- room that has no split yet. The app recomputes the same rule (features/operations/logic/pax.ts,
-- reservationSplits); this view is for checking it from SQL.
create or replace view public.reservation_split_check with (security_invoker = true) as
select r.hotel_id, trim(r.reference) as reference, r.arrival_date,
       count(*) as rooms,
       max(r.adults + r.children + r.babies) as reservation_pax,
       sum(r.split_adults + r.split_children + r.split_babies) as split_pax,
       max(r.split_for_pax) as split_for_pax,
       count(*) filter (where r.split_adults is null) as rooms_without_split,
       (count(*) filter (where r.split_adults is null) > 0
        or sum(r.split_adults) <> max(r.adults)
        or sum(r.split_children) <> max(r.children)
        or sum(r.split_babies) <> max(r.babies)) as needs_resplit
  from public.active_reservations r
 where nullif(trim(r.reference), '') is not null
 group by r.hotel_id, trim(r.reference), r.arrival_date
having count(*) > 1 and count(*) filter (where r.split_adults is not null) > 0;

revoke all on function public.set_reservation_split(text, date, jsonb, boolean) from public, anon;
grant execute on function public.set_reservation_split(text, date, jsonb, boolean) to authenticated;
commit;
