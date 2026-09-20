create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug citext not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'America/Costa_Rica',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.hotels is 'Tenant root. Every operational row belongs to one hotel.';
