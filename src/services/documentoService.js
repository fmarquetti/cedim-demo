import { supabase } from "../lib/supabaseClient";

function formatFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function mapDocumento(row) {
  return {
    id: row.id,
    fecha: formatFecha(row.fecha),
    fechaDb: row.fecha,
    tipo: row.tipo,
    descripcion: row.descripcion,
    asociadoA: row.asociado_a || "",
    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Todas",
    archivo: row.archivo || "",
    archivoPath: row.archivo_path || "",
    archivoUrl: row.archivo_url || "",
    archivoTipo: row.archivo_tipo || "",
    archivoSize: row.archivo_size || 0,
    estado: row.estado,
    datosFiscales: row.datos_fiscales || null,
  };
}

export async function getDocumentos(sedeId = null) {
  const idParaFiltro = sedeId === "todas" ? null : sedeId;

  let query = supabase
    .from("documentos")
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (idParaFiltro) {
    query = query.eq("sede_id", idParaFiltro);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data.map(mapDocumento);
}

export async function createDocumento(form) {
  const { data, error } = await supabase
    .from("documentos")
    .insert({
      fecha: form.fecha,
      tipo: form.tipo,
      descripcion: form.descripcion,
      asociado_a: form.asociadoA || null,
      sede_id: form.sedeId || null,
      archivo: form.archivo || null,
      archivo_path: form.archivoPath || null,
      archivo_url: form.archivoUrl || null,
      archivo_tipo: form.archivoTipo || null,
      archivo_size: form.archivoSize || null,
      estado: form.estado || "Pendiente revisión",
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

  return mapDocumento(data);
}

export async function deleteDocumento(id) {
  const { error } = await supabase
    .from("documentos")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function updateEstadoDocumento(id, estado) {
  const { data, error } = await supabase
    .from("documentos")
    .update({
      estado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .single();

  if (error) throw error;

  return mapDocumento(data);
}