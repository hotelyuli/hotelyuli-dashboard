create type public.app_role as enum (
  'owner', 'manager', 'reception', 'housekeeping',
  'restaurant', 'maintenance', 'read_only'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  hotel_id uuid not null references public.hotels(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 120),
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_hotel_role_idx on public.profiles (hotel_id, role) where active;
