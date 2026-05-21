create table if not exists public.contabilidad_periodos (
  id uuid primary key default gen_random_uuid(),
  anio integer not null,
  mes integer not null,
  fecha_desde date not null,
  fecha_hasta date not null,
  estado text not null default 'abierto',
  cerrado_por uuid null,
  cerrado_at timestamptz null,
  observaciones text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contabilidad_periodos_anio_mes_key unique (anio, mes),
  constraint contabilidad_periodos_mes_check check (mes between 1 and 12),
  constraint contabilidad_periodos_estado_check check (estado in ('abierto', 'cerrado'))
);

create index if not exists contabilidad_periodos_anio_idx on public.contabilidad_periodos (anio);
create index if not exists contabilidad_periodos_mes_idx on public.contabilidad_periodos (mes);
create index if not exists contabilidad_periodos_estado_idx on public.contabilidad_periodos (estado);
create index if not exists contabilidad_periodos_fecha_desde_idx on public.contabilidad_periodos (fecha_desde);
create index if not exists contabilidad_periodos_fecha_hasta_idx on public.contabilidad_periodos (fecha_hasta);

alter table public.contabilidad_periodos enable row level security;

drop policy if exists "Usuarios autenticados leen periodos contables" on public.contabilidad_periodos;
create policy "Usuarios autenticados leen periodos contables"
on public.contabilidad_periodos
for select
using (auth.role() = 'authenticated');

drop policy if exists "Usuarios autenticados insertan periodos contables" on public.contabilidad_periodos;
create policy "Usuarios autenticados insertan periodos contables"
on public.contabilidad_periodos
for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Usuarios autenticados actualizan periodos contables" on public.contabilidad_periodos;
create policy "Usuarios autenticados actualizan periodos contables"
on public.contabilidad_periodos
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Usuarios autenticados eliminan periodos contables" on public.contabilidad_periodos;
create policy "Usuarios autenticados eliminan periodos contables"
on public.contabilidad_periodos
for delete
using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
