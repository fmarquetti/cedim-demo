alter table public.usuarios
add column if not exists permisos text[] not null default '{}';

do $$
declare
  permisos_type text;
begin
  select data_type
  into permisos_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'usuarios'
    and column_name = 'permisos';

  if permisos_type = 'ARRAY' then
    update public.usuarios
    set permisos = array['all']::text[]
    where rol = 'Administrador';

    update public.usuarios
    set permisos = array[
      'dashboard.view',
      'ingresos.view',
      'ingresos.create',
      'ingresos.edit',
      'egresos.view',
      'pacientes.view',
      'pacientes.create',
      'turnos.view',
      'turnos.create'
    ]::text[]
    where rol = 'Operador';
  elsif permisos_type = 'jsonb' then
    update public.usuarios
    set permisos = '["all"]'::jsonb
    where rol = 'Administrador';

    update public.usuarios
    set permisos = '[
      "dashboard.view",
      "ingresos.view",
      "ingresos.create",
      "ingresos.edit",
      "egresos.view",
      "pacientes.view",
      "pacientes.create",
      "turnos.view",
      "turnos.create"
    ]'::jsonb
    where rol = 'Operador';
  end if;
end $$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.estado = 'Activo'
      and u.rol = 'Administrador'
  );
$$;

alter function public.current_user_is_admin() owner to postgres;

alter table public.usuarios enable row level security;

drop policy if exists "usuarios_select_own_or_admin" on public.usuarios;
drop policy if exists "usuarios_update_admin_only" on public.usuarios;
drop policy if exists "usuarios_insert_admin_only" on public.usuarios;
drop policy if exists "usuarios_delete_admin_only" on public.usuarios;
drop policy if exists "usuarios_update_admin_permissions" on public.usuarios;
drop policy if exists "usuarios_insert_admin" on public.usuarios;
drop policy if exists "usuarios_delete_admin" on public.usuarios;
drop policy if exists "Administrador puede ver usuarios" on public.usuarios;
drop policy if exists "Solo administradores pueden crear usuarios" on public.usuarios;
drop policy if exists "Solo administradores pueden editar usuarios" on public.usuarios;
drop policy if exists "Solo administradores pueden eliminar usuarios" on public.usuarios;
drop policy if exists "Usuario puede ver su propio perfil" on public.usuarios;

create policy "usuarios_select_own_or_admin"
on public.usuarios
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.current_user_is_admin()
);

create policy "usuarios_update_admin_only"
on public.usuarios
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy "usuarios_insert_admin_only"
on public.usuarios
for insert
to authenticated
with check (public.current_user_is_admin());

create policy "usuarios_delete_admin_only"
on public.usuarios
for delete
to authenticated
using (public.current_user_is_admin());

grant execute on function public.current_user_is_admin() to authenticated;
