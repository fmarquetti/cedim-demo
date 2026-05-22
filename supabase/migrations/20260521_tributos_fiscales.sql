create table if not exists public.tributos_tipos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  categoria text not null,
  jurisdiccion text null,
  cuenta_contable_id uuid null references public.contabilidad_cuentas(id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tributos_tipos_categoria_check
    check (categoria in ('retencion', 'percepcion', 'impuesto', 'tasa', 'otro'))
);

create table if not exists public.comprobante_tributos (
  id uuid primary key default gen_random_uuid(),
  origen text not null,
  origen_id uuid not null,
  tributo_tipo_id uuid null references public.tributos_tipos(id),
  codigo text null,
  descripcion text not null,
  categoria text not null,
  base_imponible numeric(14,2) not null default 0,
  alicuota numeric(8,4) null,
  importe numeric(14,2) not null default 0,
  signo integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comprobante_tributos_origen_check
    check (origen in ('egreso', 'arca_invoice', 'ingreso', 'manual')),
  constraint comprobante_tributos_categoria_check
    check (categoria in ('retencion', 'percepcion', 'impuesto', 'tasa', 'otro')),
  constraint comprobante_tributos_importe_check
    check (importe >= 0),
  constraint comprobante_tributos_signo_check
    check (signo in (-1, 1))
);

create table if not exists public.comprobante_conceptos_fiscales (
  id uuid primary key default gen_random_uuid(),
  origen text not null,
  origen_id uuid not null,
  descripcion text not null,
  tipo text not null,
  neto numeric(14,2) not null default 0,
  iva numeric(14,2) not null default 0,
  alicuota_iva numeric(8,4) null,
  exento numeric(14,2) not null default 0,
  no_gravado numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comprobante_conceptos_fiscales_origen_check
    check (origen in ('egreso', 'arca_invoice', 'ingreso', 'manual')),
  constraint comprobante_conceptos_fiscales_tipo_check
    check (tipo in ('gravado', 'exento', 'no_gravado', 'mixto')),
  constraint comprobante_conceptos_fiscales_neto_check
    check (neto >= 0),
  constraint comprobante_conceptos_fiscales_iva_check
    check (iva >= 0),
  constraint comprobante_conceptos_fiscales_exento_check
    check (exento >= 0),
  constraint comprobante_conceptos_fiscales_no_gravado_check
    check (no_gravado >= 0),
  constraint comprobante_conceptos_fiscales_total_check
    check (total >= 0)
);

create index if not exists idx_comprobante_tributos_origen
  on public.comprobante_tributos (origen);
create index if not exists idx_comprobante_tributos_origen_id
  on public.comprobante_tributos (origen_id);
create index if not exists idx_comprobante_tributos_tributo_tipo_id
  on public.comprobante_tributos (tributo_tipo_id);
create index if not exists idx_comprobante_tributos_categoria
  on public.comprobante_tributos (categoria);
create unique index if not exists idx_comprobante_tributos_origen_codigo
  on public.comprobante_tributos (origen, origen_id, codigo)
  where codigo is not null;

create index if not exists idx_comprobante_conceptos_fiscales_origen
  on public.comprobante_conceptos_fiscales (origen);
create index if not exists idx_comprobante_conceptos_fiscales_origen_id
  on public.comprobante_conceptos_fiscales (origen_id);
create index if not exists idx_comprobante_conceptos_fiscales_tipo
  on public.comprobante_conceptos_fiscales (tipo);

alter table public.tributos_tipos enable row level security;
alter table public.comprobante_tributos enable row level security;
alter table public.comprobante_conceptos_fiscales enable row level security;

drop policy if exists "tributos_tipos_select_authenticated" on public.tributos_tipos;
create policy "tributos_tipos_select_authenticated" on public.tributos_tipos
  for select using (auth.role() = 'authenticated');
drop policy if exists "tributos_tipos_insert_authenticated" on public.tributos_tipos;
create policy "tributos_tipos_insert_authenticated" on public.tributos_tipos
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "tributos_tipos_update_authenticated" on public.tributos_tipos;
create policy "tributos_tipos_update_authenticated" on public.tributos_tipos
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "tributos_tipos_delete_authenticated" on public.tributos_tipos;
create policy "tributos_tipos_delete_authenticated" on public.tributos_tipos
  for delete using (auth.role() = 'authenticated');

drop policy if exists "comprobante_tributos_select_authenticated" on public.comprobante_tributos;
create policy "comprobante_tributos_select_authenticated" on public.comprobante_tributos
  for select using (auth.role() = 'authenticated');
drop policy if exists "comprobante_tributos_insert_authenticated" on public.comprobante_tributos;
create policy "comprobante_tributos_insert_authenticated" on public.comprobante_tributos
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "comprobante_tributos_update_authenticated" on public.comprobante_tributos;
create policy "comprobante_tributos_update_authenticated" on public.comprobante_tributos
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "comprobante_tributos_delete_authenticated" on public.comprobante_tributos;
create policy "comprobante_tributos_delete_authenticated" on public.comprobante_tributos
  for delete using (auth.role() = 'authenticated');

drop policy if exists "comprobante_conceptos_fiscales_select_authenticated" on public.comprobante_conceptos_fiscales;
create policy "comprobante_conceptos_fiscales_select_authenticated" on public.comprobante_conceptos_fiscales
  for select using (auth.role() = 'authenticated');
drop policy if exists "comprobante_conceptos_fiscales_insert_authenticated" on public.comprobante_conceptos_fiscales;
create policy "comprobante_conceptos_fiscales_insert_authenticated" on public.comprobante_conceptos_fiscales
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "comprobante_conceptos_fiscales_update_authenticated" on public.comprobante_conceptos_fiscales;
create policy "comprobante_conceptos_fiscales_update_authenticated" on public.comprobante_conceptos_fiscales
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "comprobante_conceptos_fiscales_delete_authenticated" on public.comprobante_conceptos_fiscales;
create policy "comprobante_conceptos_fiscales_delete_authenticated" on public.comprobante_conceptos_fiscales
  for delete using (auth.role() = 'authenticated');

insert into public.contabilidad_cuentas (codigo, nombre, tipo)
values
  ('2.1.05', 'Retenciones a pagar', 'PASIVO'),
  ('2.1.06', 'Percepciones a pagar', 'PASIVO'),
  ('2.1.07', 'Impuestos a pagar', 'PASIVO'),
  ('1.1.05', 'Retenciones sufridas', 'ACTIVO'),
  ('1.1.06', 'Percepciones sufridas', 'ACTIVO'),
  ('1.1.07', 'Saldo fiscal a favor', 'ACTIVO'),
  ('5.1.07', 'Impuestos no recuperables', 'EGRESO')
on conflict (codigo) do nothing;

insert into public.tributos_tipos (codigo, nombre, categoria, jurisdiccion)
values
  ('RET_GANANCIAS', 'Retencion Ganancias', 'retencion', 'Nacional'),
  ('RET_IVA', 'Retencion IVA', 'retencion', 'Nacional'),
  ('RET_IIBB', 'Retencion Ingresos Brutos', 'retencion', 'Provincial'),
  ('PERC_IVA', 'Percepcion IVA', 'percepcion', 'Nacional'),
  ('PERC_IIBB', 'Percepcion Ingresos Brutos', 'percepcion', 'Provincial'),
  ('IMP_INTERNO', 'Impuestos Internos', 'impuesto', 'Nacional'),
  ('TASA_MUNICIPAL', 'Tasa Municipal', 'tasa', 'Municipal'),
  ('OTRO_TRIBUTO', 'Otro tributo', 'otro', null)
on conflict (codigo) do nothing;

notify pgrst, 'reload schema';
