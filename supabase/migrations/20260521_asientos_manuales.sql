alter table public.contabilidad_asientos
add column if not exists tipo_asiento text null default 'automatico';

alter table public.contabilidad_asientos
add column if not exists observaciones text null;

alter table public.contabilidad_asientos
add column if not exists confirmado_at timestamptz null;

alter table public.contabilidad_asientos
add column if not exists confirmado_by uuid null;

alter table public.contabilidad_asientos
add column if not exists anulado_at timestamptz null;

alter table public.contabilidad_asientos
add column if not exists anulado_by uuid null;

alter table public.contabilidad_asientos
add column if not exists motivo_anulacion text null;

notify pgrst, 'reload schema';
