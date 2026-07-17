alter table public.ingresos
add column if not exists fecha_vencimiento date null;

create index if not exists idx_ingresos_fecha_vencimiento
on public.ingresos (fecha_vencimiento);
