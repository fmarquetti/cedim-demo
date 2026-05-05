import { supabase } from "../lib/supabaseClient";

function mapCuenta(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Todas las sedes",
    activa: row.activa,
  };
}

export async function getCuentasBancarias(sedeId = null) {
  const idParaFiltro = sedeId === "todas" ? null : sedeId;

  let query = supabase
    .from("cuentas_bancarias")
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .order("nombre", { ascending: true });

  if (idParaFiltro) {
    query = query.eq("sede_id", idParaFiltro);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data.map(mapCuentaBancaria);
}

export async function createCuentaBancaria(form) {
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .insert({
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      sede_id: form.sedeId || null,
      activa: true,
    })
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .single();

  if (error) throw error;

  return mapCuenta(data);
}