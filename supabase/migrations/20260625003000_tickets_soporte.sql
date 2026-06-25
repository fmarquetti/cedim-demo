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

create or replace function public.current_usuario_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select u.id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.estado = 'Activo'
  limit 1;
$$;

alter function public.current_usuario_id() owner to postgres;

create or replace function public.current_user_can_access_sede(target_sede_id uuid)
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
      and (
        target_sede_id is null
        or u.acceso_todas_sedes = true
        or exists (
          select 1
          from public.usuario_sedes us
          where us.usuario_id = u.id
            and us.sede_id = target_sede_id
        )
      )
  );
$$;

alter function public.current_user_can_access_sede(uuid) owner to postgres;

create sequence if not exists public.tickets_codigo_seq;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  titulo text not null,
  descripcion text not null,
  categoria text not null,
  prioridad text not null default 'Media',
  estado text not null default 'Abierto',
  creado_por uuid null,
  asignado_a uuid null,
  sede_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_creado_por_fkey
    foreign key (creado_por) references public.usuarios(id) on delete set null,
  constraint tickets_asignado_a_fkey
    foreign key (asignado_a) references public.usuarios(id) on delete set null,
  constraint tickets_sede_id_fkey
    foreign key (sede_id) references public.sedes(id) on delete set null,
  constraint tickets_categoria_check
    check (categoria in ('Error', 'Mejora', 'Consulta', 'Configuración')),
  constraint tickets_prioridad_check
    check (prioridad in ('Baja', 'Media', 'Alta', 'Urgente')),
  constraint tickets_estado_check
    check (estado in ('Abierto', 'En proceso', 'Resuelto', 'Cerrado')),
  constraint tickets_titulo_not_empty check (length(trim(titulo)) > 0),
  constraint tickets_descripcion_not_empty check (length(trim(descripcion)) > 0)
);

create table if not exists public.ticket_comentarios (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  usuario_id uuid null references public.usuarios(id) on delete set null,
  comentario text not null,
  interno boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ticket_comentarios_comentario_not_empty check (length(trim(comentario)) > 0)
);

create table if not exists public.ticket_adjuntos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null,
  mime_type text null,
  size_bytes bigint null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tickets_created_at on public.tickets (created_at desc);
create index if not exists idx_tickets_estado on public.tickets (estado);
create index if not exists idx_tickets_prioridad on public.tickets (prioridad);
create index if not exists idx_tickets_creado_por on public.tickets (creado_por);
create index if not exists idx_tickets_asignado_a on public.tickets (asignado_a);
create index if not exists idx_tickets_sede_id on public.tickets (sede_id);
create index if not exists idx_ticket_comentarios_ticket_id on public.ticket_comentarios (ticket_id);
create index if not exists idx_ticket_comentarios_usuario_id on public.ticket_comentarios (usuario_id);
create index if not exists idx_ticket_adjuntos_ticket_id on public.ticket_adjuntos (ticket_id);

create or replace function public.set_tickets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_ticket_codigo()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is null or length(trim(new.codigo)) = 0 then
    new.codigo = 'TCK-' || lpad(nextval('public.tickets_codigo_seq')::text, 6, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
before update on public.tickets
for each row
execute function public.set_tickets_updated_at();

drop trigger if exists trg_tickets_codigo on public.tickets;
create trigger trg_tickets_codigo
before insert on public.tickets
for each row
execute function public.set_ticket_codigo();

alter table public.tickets enable row level security;
alter table public.ticket_comentarios enable row level security;
alter table public.ticket_adjuntos enable row level security;

drop policy if exists "tickets_select_own_sede_or_admin" on public.tickets;
drop policy if exists "tickets_insert_authenticated" on public.tickets;
drop policy if exists "tickets_update_admin_only" on public.tickets;
drop policy if exists "tickets_delete_admin_only" on public.tickets;
drop policy if exists "ticket_comentarios_select_visible" on public.ticket_comentarios;
drop policy if exists "ticket_comentarios_insert_visible" on public.ticket_comentarios;
drop policy if exists "ticket_comentarios_update_admin_only" on public.ticket_comentarios;
drop policy if exists "ticket_comentarios_delete_admin_only" on public.ticket_comentarios;
drop policy if exists "ticket_adjuntos_select_visible" on public.ticket_adjuntos;
drop policy if exists "ticket_adjuntos_insert_visible" on public.ticket_adjuntos;
drop policy if exists "ticket_adjuntos_delete_admin_only" on public.ticket_adjuntos;

create policy "tickets_select_own_sede_or_admin"
on public.tickets
for select
to authenticated
using (
  public.current_user_is_admin()
  or (
    creado_por = public.current_usuario_id()
    and public.current_user_can_access_sede(sede_id)
  )
);

create policy "tickets_insert_authenticated"
on public.tickets
for insert
to authenticated
with check (
  creado_por = public.current_usuario_id()
  and public.current_user_can_access_sede(sede_id)
);

create policy "tickets_update_admin_only"
on public.tickets
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy "tickets_delete_admin_only"
on public.tickets
for delete
to authenticated
using (public.current_user_is_admin());

create policy "ticket_comentarios_select_visible"
on public.ticket_comentarios
for select
to authenticated
using (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_comentarios.ticket_id
      and (
        public.current_user_is_admin()
        or (
          ticket_comentarios.interno = false
          and t.creado_por = public.current_usuario_id()
          and public.current_user_can_access_sede(t.sede_id)
        )
      )
  )
);

create policy "ticket_comentarios_insert_visible"
on public.ticket_comentarios
for insert
to authenticated
with check (
  usuario_id = public.current_usuario_id()
  and exists (
    select 1
    from public.tickets t
    where t.id = ticket_comentarios.ticket_id
      and (
        public.current_user_is_admin()
        or (
          ticket_comentarios.interno = false
          and
          t.creado_por = public.current_usuario_id()
          and public.current_user_can_access_sede(t.sede_id)
        )
      )
  )
);

create policy "ticket_comentarios_update_admin_only"
on public.ticket_comentarios
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy "ticket_comentarios_delete_admin_only"
on public.ticket_comentarios
for delete
to authenticated
using (public.current_user_is_admin());

create policy "ticket_adjuntos_select_visible"
on public.ticket_adjuntos
for select
to authenticated
using (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_adjuntos.ticket_id
      and (
        public.current_user_is_admin()
        or (
          t.creado_por = public.current_usuario_id()
          and public.current_user_can_access_sede(t.sede_id)
        )
      )
  )
);

create policy "ticket_adjuntos_insert_visible"
on public.ticket_adjuntos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_adjuntos.ticket_id
      and (
        public.current_user_is_admin()
        or (
          t.creado_por = public.current_usuario_id()
          and public.current_user_can_access_sede(t.sede_id)
        )
      )
  )
);

create policy "ticket_adjuntos_delete_admin_only"
on public.ticket_adjuntos
for delete
to authenticated
using (public.current_user_is_admin());

grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_usuario_id() to authenticated;
grant execute on function public.current_user_can_access_sede(uuid) to authenticated;

notify pgrst, 'reload schema';
