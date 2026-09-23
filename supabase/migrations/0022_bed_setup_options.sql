begin;
alter table public.daily_operations drop constraint if exists daily_operations_bed_setup_check;
alter table public.daily_operations add constraint daily_operations_bed_setup_check
  check (bed_setup is null or bed_setup in ('king', 'two_twin', 'three_twin', 'king_twin'));
comment on column public.daily_operations.bed_setup is 'king | two_twin | three_twin | king_twin (King / 2 Twin / 3 Twin / King+Twin), only for rooms 1,2,6,9,10,12,13,18; null = not set.';
commit;
