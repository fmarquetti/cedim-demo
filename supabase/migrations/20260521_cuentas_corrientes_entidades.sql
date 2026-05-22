create table if not exists public.entidades_cuenta_corriente (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  nombre text not null,
  documento text null,
  condicion_iva text null,
  email text null,
  telefono text null,
  domicilio text null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entidades_cc_tipo_check check (tipo in ('cliente', 'proveedor', 'ambos'))
);

create unique index if not exists idx_entidades_cc_tipo_documento_unico
on public.entidades_cuenta_corriente (tipo, documento)
where documento is not null and documento <> '';

create index if not exists idx_entidades_cc_tipo on public.entidades_cuenta_corriente (tipo);
create index if not exists idx_entidades_cc_nombre on public.entidades_cuenta_corriente (nombre);
create index if not exists idx_entidades_cc_documento on public.entidades_cuenta_corriente (documento);
create index if not exists idx_entidades_cc_activa on public.entidades_cuenta_corriente (activa);

create table if not exists public.cuenta_corriente_movimientos (
  id uuid primary key default gen_random_uuid(),
  entidad_id uuid not null references public.entidades_cuenta_corriente(id),
  fecha date not null,
  tipo_entidad text not null,
  tipo_movimiento text not null,
  origen text not null,
  origen_id uuid null,
  descripcion text not null,
  comprobante text null,
  debe numeric(14,2) not null default 0,
  haber numeric(14,2) not null default 0,
  saldo numeric(14,2) null,
  estado text not null default 'pendiente',
  sede_id uuid null references public.sedes(id),
  metadata jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cc_mov_tipo_entidad_check check (tipo_entidad in ('cliente', 'proveedor')),
  constraint cc_mov_tipo_movimiento_check check (tipo_movimiento in ('factura', 'nota_credito', 'nota_debito', 'cobro', 'pago', 'ajuste', 'saldo_inicial')),
  constraint cc_mov_origen_check check (origen in ('arca_invoice', 'ingreso', 'egreso', 'orden_pago', 'banco', 'manual', 'saldo_inicial')),
  constraint cc_mov_estado_check check (estado in ('pendiente', 'aplicado', 'anulado')),
  constraint cc_mov_debe_nonnegative check (debe >= 0),
  constraint cc_mov_haber_nonnegative check (haber >= 0),
  constraint cc_mov_debe_haber_exclusivos check (
    (debe > 0 and haber = 0) or (debe = 0 and haber > 0)
  )
);

create index if not exists idx_cc_movimientos_entidad_id on public.cuenta_corriente_movimientos (entidad_id);
create index if not exists idx_cc_movimientos_fecha on public.cuenta_corriente_movimientos (fecha);
create index if not exists idx_cc_movimientos_tipo_entidad on public.cuenta_corriente_movimientos (tipo_entidad);
create index if not exists idx_cc_movimientos_tipo_movimiento on public.cuenta_corriente_movimientos (tipo_movimiento);
create index if not exists idx_cc_movimientos_origen on public.cuenta_corriente_movimientos (origen);
create index if not exists idx_cc_movimientos_origen_id on public.cuenta_corriente_movimientos (origen_id);
create index if not exists idx_cc_movimientos_estado on public.cuenta_corriente_movimientos (estado);
create index if not exists idx_cc_movimientos_sede_id on public.cuenta_corriente_movimientos (sede_id);

create unique index if not exists idx_cc_movimientos_origen_unico
on public.cuenta_corriente_movimientos (origen, origen_id, tipo_movimiento)
where origen_id is not null and estado <> 'anulado';

alter table public.entidades_cuenta_corriente enable row level security;
alter table public.cuenta_corriente_movimientos enable row level security;

drop policy if exists "entidades_cc_select_auth" on public.entidades_cuenta_corriente;
create policy "entidades_cc_select_auth"
on public.entidades_cuenta_corriente for select
to authenticated
using (true);

drop policy if exists "entidades_cc_insert_auth" on public.entidades_cuenta_corriente;
create policy "entidades_cc_insert_auth"
on public.entidades_cuenta_corriente for insert
to authenticated
with check (true);

drop policy if exists "entidades_cc_update_auth" on public.entidades_cuenta_corriente;
create policy "entidades_cc_update_auth"
on public.entidades_cuenta_corriente for update
to authenticated
using (true)
with check (true);

drop policy if exists "entidades_cc_delete_auth" on public.entidades_cuenta_corriente;
create policy "entidades_cc_delete_auth"
on public.entidades_cuenta_corriente for delete
to authenticated
using (true);

drop policy if exists "cc_movimientos_select_auth" on public.cuenta_corriente_movimientos;
create policy "cc_movimientos_select_auth"
on public.cuenta_corriente_movimientos for select
to authenticated
using (true);

drop policy if exists "cc_movimientos_insert_auth" on public.cuenta_corriente_movimientos;
create policy "cc_movimientos_insert_auth"
on public.cuenta_corriente_movimientos for insert
to authenticated
with check (true);

drop policy if exists "cc_movimientos_update_auth" on public.cuenta_corriente_movimientos;
create policy "cc_movimientos_update_auth"
on public.cuenta_corriente_movimientos for update
to authenticated
using (true)
with check (true);

drop policy if exists "cc_movimientos_delete_auth" on public.cuenta_corriente_movimientos;
create policy "cc_movimientos_delete_auth"
on public.cuenta_corriente_movimientos for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
