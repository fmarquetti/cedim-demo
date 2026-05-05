import { supabase } from "../lib/supabaseClient";

function mapMovimiento(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    entidad: row.entidad,
    tipoEntidad: row.tipo_entidad,
    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Sin sede",
    comprobante: row.comprobante,
    numero: row.numero || "",
    concepto: row.concepto,
    importe: Number(row.importe || 0),
    vencimiento: row.vencimiento || "",
    estado: row.estado,
  };
}

export async function getCuentasCorrientes(sedeId = null) {
  const idParaFiltro = sedeId === "todas" ? null : sedeId;

  let query = supabase
    .from("cuentas_corrientes")
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .order("fecha", { ascending: false });

  if (idParaFiltro) {
    query = query.eq("sede_id", idParaFiltro);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data.map(mapMovimiento);
}

export async function createCuentaCorriente(form) {
  const { data, error } = await supabase
    .from("cuentas_corrientes")
    .insert({
      fecha: form.fecha,
      entidad: form.entidad,
      tipo_entidad: form.tipoEntidad,
      sede_id: form.sedeId,
      comprobante: form.comprobante,
      numero: form.numero || null,
      concepto: form.concepto,
      importe: Number(form.importe || 0),
      vencimiento: form.vencimiento || null,
      estado: form.estado || "Pendiente",
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

  return mapMovimiento(data);
}

export async function deleteCuentaCorriente(id) {
  const { error } = await supabase
    .from("cuentas_corrientes")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function marcarCuentaAplicada(id) {
  const { error } = await supabase
    .from("cuentas_corrientes")
    .update({
      estado: "Aplicado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}