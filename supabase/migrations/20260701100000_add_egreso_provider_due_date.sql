alter table public.egresos
add column if not exists proveedor_cuit text null,
add column if not exists fecha_vencimiento date null;

create index if not exists idx_egresos_proveedor_cuit
on public.egresos (proveedor_cuit);

create index if not exists idx_egresos_fecha_vencimiento
on public.egresos (fecha_vencimiento);

notify pgrst, 'reload schema';
