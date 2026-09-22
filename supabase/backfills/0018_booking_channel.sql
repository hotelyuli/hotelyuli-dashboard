-- One-time backfill: infer booking_channel from the Reservation Number prefix
-- for reservations imported before channel inference existed, then copy it
-- onto existing board rows. Mirrors inferBookingChannel() in
-- features/operations/logic/reservation-normalizer.ts. Only fills nulls, so
-- it never overwrites a channel typed on the board; safe to re-run.
begin;
update public.reservations
set booking_channel = case upper(substring(reference from '^\s*([A-Za-z]+)'))
    when 'LH' then 'Directo'
    when 'BDC' then 'Booking.com'
    when 'EXP' then 'Expedia'
    when 'SMP' then 'Simple Booking'
    when 'HWL' then 'Hostelworld'
  end,
  updated_at = now()
where booking_channel is null
  and upper(substring(reference from '^\s*([A-Za-z]+)')) in ('LH', 'BDC', 'EXP', 'SMP', 'HWL');

update public.daily_operations d
set booking_channel = r.booking_channel
from public.reservations r
where d.reservation_id = r.id
  and d.booking_channel is null
  and r.booking_channel is not null;
commit;
