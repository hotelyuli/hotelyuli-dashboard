begin;
alter table public.daily_operations add column if not exists cleaning_status text not null default 'pending';
alter table public.daily_operations drop constraint if exists daily_operations_cleaning_status_check;
alter table public.daily_operations add constraint daily_operations_cleaning_status_check
  check (cleaning_status in ('pending', 'ready_for_inspection', 'clean'));
comment on column public.daily_operations.cleaning_status is 'Housekeeping work board: pending (cleaning) -> ready_for_inspection -> clean. New board rows start pending.';
commit;
