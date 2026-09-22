-- Room Board edit fields: assigned housekeeper, bed setup for convertible
-- rooms, and the pick-up time for a to-go breakfast. All nullable; null means
-- "Unassigned" / "Sin definir" / no time. Safe to re-run (IF NOT EXISTS).
begin;
alter table public.daily_operations
  add column if not exists housekeeper text null check (housekeeper is null or char_length(housekeeper) between 1 and 60),
  add column if not exists bed_setup text null check (bed_setup in ('king', 'two_twin')),
  add column if not exists breakfast_to_go_time time null;

comment on column public.daily_operations.housekeeper is 'Housekeeper assigned to the room for this date; null = unassigned.';
comment on column public.daily_operations.bed_setup is 'king | two_twin, only for convertible rooms 1,2,6,9,10,12,13,18; null = not set.';
comment on column public.daily_operations.breakfast_to_go_time is 'Pick-up time for a to-go breakfast; only set when breakfast_to_go is true.';
commit;
