alter table public.usuarios
  add column if not exists development_disabled_pages text[] not null default '{}';
