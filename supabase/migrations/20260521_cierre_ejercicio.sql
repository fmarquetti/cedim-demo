create table if not exists public.contabilidad_ejercicios (
  id uuid primary key default gen_random_uuid(),
  anio integer not null unique,
  fecha_desde date not null,
  fecha_hasta date not null,
  estado text not null default 'abierto',
  resultado_ejercicio numeric(14,2) null,
  asiento_cierre_id uuid null references public.contabilidad_asientos(id),
  asiento_apertura_id uuid null references public.contabilidad_asientos(id),
  cerrado_por uuid null,
  cerrado_at timestamptz null,
  reabierto_por uuid null,
  reabierto_at timestamptz null,
  observaciones text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contabilidad_ejercicios_estado_check check (estado in ('abierto', 'cerrado')),
  constraint contabilidad_ejercicios_fechas_check check (fecha_desde <= fecha_hasta)
);

create index if not exists contabilidad_ejercicios_anio_idx
  on public.contabilidad_ejercicios (anio);

create index if not exists contabilidad_ejercicios_estado_idx
  on public.contabilidad_ejercicios (estado);

create index if not exists contabilidad_ejercicios_fecha_desde_idx
  on public.contabilidad_ejercicios (fecha_desde);

create index if not exists contabilidad_ejercicios_fecha_hasta_idx
  on public.contabilidad_ejercicios (fecha_hasta);

create index if not exists contabilidad_ejercicios_asiento_cierre_id_idx
  on public.contabilidad_ejercicios (asiento_cierre_id);

create index if not exists contabilidad_ejercicios_asiento_apertura_id_idx
  on public.contabilidad_ejercicios (asiento_apertura_id);

alter table public.contabilidad_ejercicios enable row level security;

drop policy if exists "Usuarios autenticados leen ejercicios contables" on public.contabilidad_ejercicios;
create policy "Usuarios autenticados leen ejercicios contables"
on public.contabilidad_ejercicios
for select
using (auth.role() = 'authenticated');

drop policy if exists "Usuarios autenticados insertan ejercicios contables" on public.contabilidad_ejercicios;
create policy "Usuarios autenticados insertan ejercicios contables"
on public.contabilidad_ejercicios
for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Usuarios autenticados actualizan ejercicios contables" on public.contabilidad_ejercicios;
create policy "Usuarios autenticados actualizan ejercicios contables"
on public.contabilidad_ejercicios
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Usuarios autenticados eliminan ejercicios contables" on public.contabilidad_ejercicios;
create policy "Usuarios autenticados eliminan ejercicios contables"
on public.contabilidad_ejercicios
for delete
using (auth.role() = 'authenticated');

insert into public.contabilidad_cuentas (codigo, nombre, tipo)
values
  ('3.1.03', 'Resultado del ejercicio', 'PATRIMONIO_NETO'),
  ('3.1.04', 'Resultado no asignado', 'PATRIMONIO_NETO'),
  ('6.1.01', 'Cuenta puente de cierre', 'PATRIMONIO_NETO')
on conflict (codigo) do nothing;

notify pgrst, 'reload schema';
