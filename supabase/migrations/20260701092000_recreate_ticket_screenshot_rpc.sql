alter table public.tickets
add column if not exists screenshot_path text null,
add column if not exists page_url text null,
add column if not exists page_path text null,
add column if not exists browser_info text null;

drop function if exists public.set_ticket_screenshot(uuid, text, text, text, text);

create or replace function public.set_ticket_screenshot(
  ticket_id uuid,
  screenshot_path text,
  page_url text,
  page_path text,
  browser_info text
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_ticket public.tickets;
begin
  update public.tickets t
  set
    screenshot_path = $2,
    page_url = $3,
    page_path = $4,
    browser_info = $5,
    updated_at = now()
  where t.id = $1
    and (
      public.current_user_is_admin()
      or t.creado_por = public.current_usuario_id()
    )
  returning * into updated_ticket;

  if updated_ticket.id is null then
    raise exception 'Ticket no encontrado o sin permisos para actualizar captura'
      using errcode = '42501';
  end if;

  return updated_ticket;
end;
$$;

alter function public.set_ticket_screenshot(uuid, text, text, text, text) owner to postgres;
grant execute on function public.set_ticket_screenshot(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
