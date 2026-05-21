alter table public.arca_invoices
  add column if not exists comprobante_categoria text,
  add column if not exists comprobante_asociado_id uuid,
  add column if not exists comprobante_asociado_tipo integer,
  add column if not exists comprobante_asociado_punto_venta integer,
  add column if not exists comprobante_asociado_numero integer,
  add column if not exists motivo text;
