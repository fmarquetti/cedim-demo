create table if not exists public.auditoria_eventos (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  usuario_id uuid null,
  usuario_email text null,
  modulo text not null,
  accion text not null,
  entidad text not null,
  entidad_id uuid null,
  descripcion text not null,
  severidad text not null default 'info',
  datos_antes jsonb null,
  datos_despues jsonb null,
  metadata jsonb null default '{}'::jsonb,
  ip text null,
  user_agent text null,
  created_at timestamptz not null default now(),
  constraint auditoria_eventos_severidad_check
    check (severidad in ('info', 'warning', 'error', 'critical')),
  constraint auditoria_eventos_modulo_not_empty check (length(trim(modulo)) > 0),
  constraint auditoria_eventos_accion_not_empty check (length(trim(accion)) > 0),
  constraint auditoria_eventos_entidad_not_empty check (length(trim(entidad)) > 0)
);

create index if not exists idx_auditoria_eventos_fecha on public.auditoria_eventos (fecha);
create index if not exists idx_auditoria_eventos_usuario_id on public.auditoria_eventos (usuario_id);
create index if not exists idx_auditoria_eventos_usuario_email on public.auditoria_eventos (usuario_email);
create index if not exists idx_auditoria_eventos_modulo on public.auditoria_eventos (modulo);
create index if not exists idx_auditoria_eventos_accion on public.auditoria_eventos (accion);
create index if not exists idx_auditoria_eventos_entidad on public.auditoria_eventos (entidad);
create index if not exists idx_auditoria_eventos_entidad_id on public.auditoria_eventos (entidad_id);
create index if not exists idx_auditoria_eventos_severidad on public.auditoria_eventos (severidad);

alter table public.auditoria_eventos enable row level security;

drop policy if exists "Authenticated users can read audit events" on public.auditoria_eventos;
create policy "Authenticated users can read audit events"
on public.auditoria_eventos
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert audit events" on public.auditoria_eventos;
create policy "Authenticated users can insert audit events"
on public.auditoria_eventos
for insert
to authenticated
with check (true);

notify pgrst, 'reload schema';
