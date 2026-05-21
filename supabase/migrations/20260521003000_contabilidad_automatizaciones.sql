create unique index if not exists idx_contabilidad_asientos_origen_unico
  on public.contabilidad_asientos (origen, origen_id)
  where origen_id is not null and estado <> 'anulado';

alter table public.contabilidad_asientos
  drop constraint if exists contabilidad_asientos_origen_check;

alter table public.contabilidad_asientos
  add constraint contabilidad_asientos_origen_check
  check (
    origen in (
      'manual',
      'ingreso',
      'ingreso_cobro',
      'egreso',
      'egreso_pago',
      'banco',
      'banco_conciliacion',
      'arca_invoice',
      'orden_pago',
      'ajuste'
    )
  );
