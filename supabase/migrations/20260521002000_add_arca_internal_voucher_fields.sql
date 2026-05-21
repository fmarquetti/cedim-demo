alter table public.arca_invoices
  add column if not exists comprobante_interno_numero bigint null,
  add column if not exists es_fiscal boolean not null default true;
