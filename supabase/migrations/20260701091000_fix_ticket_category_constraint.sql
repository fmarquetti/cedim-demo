alter table public.tickets
drop constraint if exists tickets_categoria_check;

alter table public.tickets
add constraint tickets_categoria_check
check (categoria in ('Error', 'Mejora', 'Consulta', U&'Configuraci\00F3n'));

notify pgrst, 'reload schema';
