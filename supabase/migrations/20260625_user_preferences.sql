create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  preference_key text not null,
  preference_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_key_not_empty check (length(trim(preference_key)) > 0),
  constraint user_preferences_user_key_unique unique (user_id, preference_key)
);

create index if not exists idx_user_preferences_user_id
on public.user_preferences (user_id);

create index if not exists idx_user_preferences_key
on public.user_preferences (preference_key);

create or replace function public.set_user_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_preferences_updated_at on public.user_preferences;
create trigger trg_user_preferences_updated_at
before update on public.user_preferences
for each row
execute function public.set_user_preferences_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
on public.user_preferences
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_preferences.user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own"
on public.user_preferences
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_preferences.user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
on public.user_preferences
for update
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_preferences.user_id
      and u.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_preferences.user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "user_preferences_delete_own" on public.user_preferences;
create policy "user_preferences_delete_own"
on public.user_preferences
for delete
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_preferences.user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "user_preferences_select_admin" on public.user_preferences;
create policy "user_preferences_select_admin"
on public.user_preferences
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.acceso_todas_sedes = true
      and u.estado = 'Activo'
  )
);

notify pgrst, 'reload schema';
