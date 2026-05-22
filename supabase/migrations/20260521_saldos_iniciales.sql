create table if not exists public.contabilidad_saldos_iniciales (
  id uuid primary key default gen_random_uuid(),
  fecha_apertura date not null,
  cuenta_id uuid not null references public.contabilidad_cuentas(id),
  sede_id uuid null references public.sedes(id),
  descripcion text null,
  debe numeric(14,2) not null default 0,
  haber numeric(14,2) not null default 0,
  asiento_id uuid null references public.contabilidad_asientos(id),
  estado text not null default 'borrador',
  created_by uuid null,
  confirmado_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contabilidad_saldos_iniciales_debe_check
    check (debe >= 0),
  constraint contabilidad_saldos_iniciales_haber_check
    check (haber >= 0),
  constraint contabilidad_saldos_iniciales_un_lado_check
    check (
      (debe > 0 and haber = 0)
      or
      (haber > 0 and debe = 0)
    ),
  constraint contabilidad_saldos_iniciales_estado_check
    check (estado in ('borrador', 'confirmado', 'anulado'))
);

create index if not exists idx_saldos_iniciales_fecha_apertura
  on public.contabilidad_saldos_iniciales (fecha_apertura);

create index if not exists idx_saldos_iniciales_cuenta_id
  on public.contabilidad_saldos_iniciales (cuenta_id);

create index if not exists idx_saldos_iniciales_sede_id
  on public.contabilidad_saldos_iniciales (sede_id);

create index if not exists idx_saldos_iniciales_asiento_id
  on public.contabilidad_saldos_iniciales (asiento_id);

create index if not exists idx_saldos_iniciales_estado
  on public.contabilidad_saldos_iniciales (estado);

create unique index if not exists idx_saldos_iniciales_unico_confirmado
  on public.contabilidad_saldos_iniciales (
    fecha_apertura,
    cuenta_id,
    coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where estado = 'confirmado';

alter table public.contabilidad_saldos_iniciales enable row level security;

drop policy if exists "contabilidad_saldos_iniciales_select_authenticated" on public.contabilidad_saldos_iniciales;
create policy "contabilidad_saldos_iniciales_select_authenticated"
  on public.contabilidad_saldos_iniciales
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "contabilidad_saldos_iniciales_insert_authenticated" on public.contabilidad_saldos_iniciales;
create policy "contabilidad_saldos_iniciales_insert_authenticated"
  on public.contabilidad_saldos_iniciales
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "contabilidad_saldos_iniciales_update_authenticated" on public.contabilidad_saldos_iniciales;
create policy "contabilidad_saldos_iniciales_update_authenticated"
  on public.contabilidad_saldos_iniciales
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "contabilidad_saldos_iniciales_delete_authenticated" on public.contabilidad_saldos_iniciales;
create policy "contabilidad_saldos_iniciales_delete_authenticated"
  on public.contabilidad_saldos_iniciales
  for delete
  using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
