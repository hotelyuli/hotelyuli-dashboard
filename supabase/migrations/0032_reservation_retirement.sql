-- 0032_reservation_retirement.sql  (deployment 1)
begin;
-- Stored reservations that a newer Little Hotelier file no longer lists for their date:
--   * not in the file at all (cancelled / deleted in LH)  -> RETIRED (never deleted)
--   * in the file, but in another room (moved in LH)       -> FLAGGED for review (not retired)
-- Nothing is retired or flagged without a person confirming it (the import lists the candidates;
-- the confirmation screen sends the ticked ids). Once confirmed they stop counting at once: every
-- count reads public.active_reservations, which leaves out retired AND flagged rows. Board rows
-- (daily_operations) of those reservations are never deleted: the app hides them via that view.
alter table public.reservations
  add column if not exists retired_at timestamptz null,
  add column if not exists retired_reason text null,
  add column if not exists retired_by_import_id uuid null references public.reservation_imports(id) on delete set null,
  add column if not exists retired_by uuid null references public.profiles(id) on delete set null,
  add column if not exists review_flag text null,
  add column if not exists review_flag_detail text null,
  add column if not exists flagged_by_import_id uuid null references public.reservation_imports(id) on delete set null,
  -- Set by the review panel: "Confirmar" (retire / keep retired) or "Restaurar" (keep active; the
  -- import then never retires or flags it again until LH lists it in another room or date).
  add column if not exists reviewed_at timestamptz null,
  add column if not exists reviewed_by uuid null references public.profiles(id) on delete set null;

alter table public.reservations drop constraint if exists reservations_retired_check;
alter table public.reservations add constraint reservations_retired_check check (
  (retired_at is null and retired_reason is null)
  or (retired_at is not null and retired_reason in ('missing_from_import', 'cancelled', 'moved_in_lh', 'manual'))
);
alter table public.reservations drop constraint if exists reservations_review_flag_check;
alter table public.reservations add constraint reservations_review_flag_check check (
  review_flag is null or review_flag = 'moved_in_lh'
);

create index if not exists reservations_active_dates_idx
  on public.reservations (hotel_id, arrival_date, departure_date) where retired_at is null and review_flag is null;

-- The ONE source for every count: dashboard KPIs, Room board, breakfast, housekeeping, imports.
-- NOTE: this view is "select *", and Postgres freezes the column list when a view is created.
-- Whenever a later migration ADDS COLUMNS to public.reservations, it must recreate this view
-- (same definition) right after, or the new columns are missing from it.
create or replace view public.active_reservations with (security_invoker = true) as
  select * from public.reservations where retired_at is null and review_flag is null;

-- Called by the import right after it upserted the file's rows, and again by the confirmation screen.
-- p_seen: what the file lists, rooms resolved by room-resolver.ts:
--   [{"date": "2026-10-24", "reference": "LH-1", "guest": "Bloom, Jeramie", "room_id": "<uuid>"}, ...]
--   An entry with "room_id": null means a room of that line could not be resolved: that date is
--   skipped (never retire on a partial file) and listed in skipped_dates.
-- For every date the file lists (arrival for check_in, departure for check_out), each active,
-- not-yet-reviewed reservation on that date that the file does not list in that room is a candidate:
--   reference in the file for that date, other room -> 'moved_in_lh' (flag, not retire)
--   otherwise                                       -> 'missing_from_import' (retire)
-- Rules:
--   * Only dates >= yesterday (America/Costa_Rica) are considered; older dates are never touched.
--   * Nothing changes unless p_confirm = true. Without it the result is
--     {"status": "needs_confirmation", "candidates": [...]} (or "none"). The import never confirms.
--   * With p_confirm = true, p_only (the ids the person ticked) limits what is retired / flagged.
--     Without p_only, rows with has_payment are NEVER included (they need explicit per-row ticking).
--   * check_out files: every candidate carries may_be_extended = true (LH may have extended the stay;
--     the guest may still be in-house).
--   * has_payment = money recorded in YuliOS: an income entry linked to the stay (the accommodation
--     ledger on the reservation or its board rows, or a manual entry naming its Reservation Number), or
--     a board row Parcial, or a board row Pagado that staff set by hand (manually_modified = true).
--   * lh_paid (information only, never blocking): a board row "Pagado" derived from Little Hotelier's
--     balance 0, with no income and no manual edit.
create or replace function public.retire_missing_from_import(
  p_import_id uuid, p_file_type text, p_seen jsonb, p_confirm boolean default false, p_only uuid[] default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_hotel uuid := public.current_hotel_id();
  v_oldest date := (now() at time zone 'America/Costa_Rica')::date - 1;
  v_candidates jsonb;
  v_skipped jsonb;
  v_retired integer := 0;
  v_flagged integer := 0;
begin
  if v_hotel is null or public.current_app_role() not in ('owner', 'manager', 'reception') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_file_type not in ('check_in', 'check_out') or jsonb_typeof(p_seen) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;
  if not exists (select 1 from public.reservation_imports i where i.id = p_import_id and i.hotel_id = v_hotel) then
    raise exception 'IMPORT_NOT_FOUND';
  end if;

  with seen as (
    select x.date, nullif(trim(x.reference), '') as reference, lower(trim(coalesce(x.guest, ''))) as guest, x.room_id
    from jsonb_to_recordset(p_seen) as x(date date, reference text, guest text, room_id uuid)
  ), skipped as (
    select s.date, case when bool_or(s.room_id is null) then 'unresolved_room' else 'too_old' end as reason
    from seen s group by s.date
    having bool_or(s.room_id is null) or s.date < v_oldest
  ), dates as (
    select distinct s.date from seen s where s.date not in (select k.date from skipped k)
  ), scope as (
    select r.id, r.room_id, r.guest_name, r.reviewed_at, nullif(trim(r.reference), '') as reference,
           (case p_file_type when 'check_in' then r.arrival_date else r.departure_date end) as on_date
    from public.reservations r
    where r.hotel_id = v_hotel and r.retired_at is null and r.review_flag is null and r.reviewed_at is null
      and (case p_file_type when 'check_in' then r.arrival_date else r.departure_date end) in (select d.date from dates d)
  ), candidates as (
    select c.id, c.on_date, c.guest_name, c.reference, rm.display_name as room,
           case when c.reference is not null and exists (select 1 from seen s where s.date = c.on_date and s.reference = c.reference)
                then 'moved_in_lh' else 'missing_from_import' end as kind,
           (select string_agg(distinct rm2.display_name, ' + ') from seen s join public.rooms rm2 on rm2.id = s.room_id
             where s.date = c.on_date and s.reference = c.reference) as lh_room,
           (exists (select 1 from public.daily_operations d
                     where d.hotel_id = v_hotel and d.reservation_id = c.id
                       and (d.payment_status = 'partial' or (d.payment_status = 'paid' and d.manually_modified)))
            or exists (select 1 from public.income_entries i
                        where i.hotel_id = v_hotel
                          and (i.source_id = c.id
                               or i.source_id in (select d.id from public.daily_operations d where d.reservation_id = c.id)
                               or (c.reference is not null and i.source_type is null and i.reference_note ilike '%' || c.reference || '%')))) as has_payment,
           exists (select 1 from public.daily_operations d
                    where d.hotel_id = v_hotel and d.reservation_id = c.id and d.payment_status = 'paid' and not d.manually_modified) as lh_board_paid
    from scope c
    join public.rooms rm on rm.id = c.room_id
    where not exists (
      select 1 from seen s
      where s.date = c.on_date and s.room_id = c.room_id
        and (s.reference = c.reference
             or (s.reference is null and c.reference is null and s.guest = lower(trim(coalesce(c.guest_name, ''))))))
  )
  select coalesce((select jsonb_agg(jsonb_build_object('reservation_id', c.id, 'date', c.on_date, 'room', c.room, 'guest', c.guest_name,
           'reference', c.reference, 'kind', c.kind, 'lh_room', c.lh_room, 'has_payment', c.has_payment,
           'lh_paid', c.lh_board_paid and not c.has_payment,
           'may_be_extended', p_file_type = 'check_out') order by c.on_date, c.room) from candidates c), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('date', k.date, 'reason', k.reason) order by k.date) from skipped k), '[]'::jsonb)
    into v_candidates, v_skipped;

  if jsonb_array_length(v_candidates) = 0 then
    return jsonb_build_object('status', 'none', 'candidates', '[]'::jsonb, 'skipped_dates', v_skipped);
  end if;
  if not p_confirm then
    return jsonb_build_object('status', 'needs_confirmation', 'candidates', v_candidates, 'skipped_dates', v_skipped);
  end if;

  -- Confirmed: only the ticked ids (p_only); without p_only, never a row with a payment.
  with chosen as (
    select c.* from jsonb_to_recordset(v_candidates) as c(reservation_id uuid, kind text, lh_room text, has_payment boolean)
    where (p_only is not null and c.reservation_id = any (p_only)) or (p_only is null and not c.has_payment)
  ), retired as (
    update public.reservations r set
      retired_at = now(), retired_reason = 'missing_from_import', retired_by_import_id = p_import_id,
      retired_by = auth.uid(), updated_at = now()
    from chosen c
    where r.id = c.reservation_id and c.kind = 'missing_from_import' and r.hotel_id = v_hotel and r.retired_at is null
    returning 1
  ), flagged as (
    update public.reservations r set
      review_flag = 'moved_in_lh', review_flag_detail = c.lh_room, flagged_by_import_id = p_import_id, updated_at = now()
    from chosen c
    where r.id = c.reservation_id and c.kind = 'moved_in_lh' and r.hotel_id = v_hotel and r.review_flag is null
    returning 1
  )
  select (select count(*) from retired), (select count(*) from flagged) into v_retired, v_flagged;

  return jsonb_build_object('status', 'applied', 'retired', v_retired, 'flagged', v_flagged, 'candidates', v_candidates, 'skipped_dates', v_skipped);
end;
$$;

revoke all on function public.retire_missing_from_import(uuid, text, jsonb, boolean, uuid[]) from public, anon;
grant execute on function public.retire_missing_from_import(uuid, text, jsonb, boolean, uuid[]) to authenticated;
commit;
