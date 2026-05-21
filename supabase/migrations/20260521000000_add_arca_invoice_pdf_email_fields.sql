alter table public.arca_invoices
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_url text,
  add column if not exists pdf_generated_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_sent_to text;
