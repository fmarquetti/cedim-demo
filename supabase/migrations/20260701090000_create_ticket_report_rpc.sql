create or replace function public.create_ticket_report(
  ticket_titulo text,
  ticket_descripcion text,
  ticket_categoria text,
  ticket_prioridad text,
  ticket_sede_id uuid default null,
  ticket_screenshot_path text default null,
  ticket_page_url text default null,
  ticket_page_path text default null,
  ticket_browser_info text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  current_app_user_id uuid;
  created_ticket public.tickets;
begin
  current_app_user_id := public.current_usuario_id();

  if current_app_user_id is null then
    raise exception 'Usuario no autorizado para crear tickets'
      using errcode = '42501';
  end if;

  if not public.current_user_can_access_sede(ticket_sede_id) then
    raise exception 'Usuario sin permisos para crear tickets en esta sede'
      using errcode = '42501';
  end if;

  insert into public.tickets (
    titulo,
    descripcion,
    categoria,
    prioridad,
    estado,
    creado_por,
    sede_id,
    screenshot_path,
    page_url,
    page_path,
    browser_info
  )
  values (
    ticket_titulo,
    ticket_descripcion,
    ticket_categoria,
    ticket_prioridad,
    'Abierto',
    current_app_user_id,
    ticket_sede_id,
    ticket_screenshot_path,
    ticket_page_url,
    ticket_page_path,
    ticket_browser_info
  )
  returning * into created_ticket;

  return created_ticket;
end;
$$;

alter function public.create_ticket_report(
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text
) owner to postgres;

grant execute on function public.create_ticket_report(
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text
) to authenticated;

notify pgrst, 'reload schema';
