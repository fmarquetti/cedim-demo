alter table public.cuentas_bancarias enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cuentas_bancarias'
      and policyname = 'cuentas_bancarias_select_authenticated'
  ) then
    create policy "cuentas_bancarias_select_authenticated"
      on public.cuentas_bancarias
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cuentas_bancarias'
      and policyname = 'cuentas_bancarias_insert_authenticated'
  ) then
    create policy "cuentas_bancarias_insert_authenticated"
      on public.cuentas_bancarias
      for insert
      with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cuentas_bancarias'
      and policyname = 'cuentas_bancarias_update_authenticated'
  ) then
    create policy "cuentas_bancarias_update_authenticated"
      on public.cuentas_bancarias
      for update
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cuentas_bancarias'
      and policyname = 'cuentas_bancarias_delete_authenticated'
  ) then
    create policy "cuentas_bancarias_delete_authenticated"
      on public.cuentas_bancarias
      for delete
      using (auth.role() = 'authenticated');
  end if;
end $$;
