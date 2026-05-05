import { supabase } from "../lib/supabaseClient";

function formatFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function mapEgreso(row) {
  return {
    id: row.id,
    fecha: formatFecha(row.fecha),
    fechaDb: row.fecha,
    proveedor: row.proveedor,
    sociedad: row.sociedad,
    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Sin sede",
    concepto: row.concepto,
    importe: Number(row.importe || 0),
    categoria: row.categoria,
    estado: row.estado,
    archivo: row.archivo,
    comprobante: row.comprobante,
    datosFiscales: row.datos_fiscales,
  };
}

export async function getEgresos(sedeId = null) {
  const idParaFiltro = sedeId === "todas" ? null : sedeId;

  let query = supabase
    .from("egresos")
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

  return data.map(mapEgreso);
}

export async function createEgreso(form) {
  const { data, error } = await supabase
    .from("egresos")
    .insert({
      fecha: form.fecha,
      proveedor: form.proveedor,
      sociedad: form.sociedad,
      sede_id: form.sedeId,
      concepto: form.concepto,
      importe: Number(form.importe || 0),
      categoria: form.categoria,
      estado: form.estado || "Pendiente",
      archivo: form.archivo || null,
      comprobante: form.comprobante || null,
      datos_fiscales: form.datosFiscales || null,
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

  return mapEgreso(data);
}

export async function deleteEgreso(id) {
  const { error } = await supabase.from("egresos").delete().eq("id", id);

  if (error) throw error;
}

export async function marcarEgresoPagado(id) {
  const { error } = await supabase
    .from("egresos")
    .update({
      estado: "Pagado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}