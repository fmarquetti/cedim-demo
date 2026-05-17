import { supabase } from "../lib/supabaseClient";

function mapConceptoItem(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    activo: row.activo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConceptoItems(tipo = null) {
  let query = supabase
    .from("concepto_items")
    .select("*")
    .order("nombre", { ascending: true });

  if (tipo) {
    query = query.or(`tipo.eq.${tipo},tipo.eq.ambos`);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(mapConceptoItem);
}

export async function createConceptoItem({ nombre, tipo }) {
  const cleanNombre = String(nombre || "").trim();

  if (!cleanNombre) {
    throw new Error("El nombre del concepto es obligatorio.");
  }

  if (!["ingreso", "egreso", "ambos"].includes(tipo)) {
    throw new Error("El tipo de concepto no es válido.");
  }

  const { data, error } = await supabase
    .from("concepto_items")
    .insert({
      nombre: cleanNombre,
      tipo,
      activo: true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe un concepto con ese nombre y tipo.");
    }

    throw error;
  }

  return mapConceptoItem(data);
}

export async function updateConceptoItem(id, values) {
  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (values.nombre !== undefined) {
    payload.nombre = String(values.nombre || "").trim();
  }

  if (values.tipo !== undefined) {
    payload.tipo = values.tipo;
  }

  if (values.activo !== undefined) {
    payload.activo = Boolean(values.activo);
  }

  const { data, error } = await supabase
    .from("concepto_items")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe un concepto con ese nombre y tipo.");
    }

    throw error;
  }

  return mapConceptoItem(data);
}

export async function deleteConceptoItem(id) {
  const { error } = await supabase
    .from("concepto_items")
    .delete()
    .eq("id", id);

  if (error) throw error;
}