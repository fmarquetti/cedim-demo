import { supabase } from "../lib/supabaseClient";
import { getDbSedeId } from "../utils/sedeUtils";

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
  const idParaFiltro = getDbSedeId(sedeId);

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
    query = query.or(`sede_id.eq.${idParaFiltro},sede_id.is.null`);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data.map(mapCuenta);
}

export async function createCuentaBancaria(form) {
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .insert({
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      sede_id: getDbSedeId(form.sedeId),
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

  if (error) {
    if (error.code === "42501") {
      throw new Error("No tenés permisos para crear cuentas bancarias. Revisá las políticas RLS de cuentas_bancarias.");
    }

    if (error.code === "23505") {
      throw new Error("Ya existe una cuenta bancaria con ese nombre.");
    }

    throw error;
  }

  return mapCuenta(data);
}
