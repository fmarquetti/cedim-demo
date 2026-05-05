import { supabase } from "../lib/supabaseClient";

function formatFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function mapPacienteEstudio(row) {
  return {
    id: row.id,
    fecha: formatFecha(row.fecha),
    fechaDb: row.fecha,
    paciente: row.paciente,
    dni: row.dni,
    obraSocial: row.obra_social || "",
    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Sin sede",
    estudio: row.estudio,
    prioridad: row.prioridad,
    estado: row.estado,
    observaciones: row.observaciones || "",
    archivo: row.archivo || "",
    archivoPath: row.archivo_path || "",
    archivoUrl: row.archivo_url || "",
    archivoTipo: row.archivo_tipo || "",
    archivoSize: row.archivo_size || 0,
    linkEstudio: row.link_estudio || "",
  };
}

export async function getPacientesEstudios(sedeId = null) {
  const idParaFiltro = sedeId === "todas" ? null : sedeId;

  let query = supabase
    .from("pacientes_estudios")
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

  return data.map(mapPacienteEstudio);
}

export async function createPacienteEstudio(form) {
  const { data, error } = await supabase
    .from("pacientes_estudios")
    .insert({
      fecha: form.fecha,
      paciente: form.paciente,
      dni: form.dni,
      obra_social: form.obraSocial || null,
      sede_id: form.sedeId,
      estudio: form.estudio,
      prioridad: form.prioridad || "Normal",
      estado: form.estado || "Muestra pendiente",
      observaciones: form.observaciones || null,
      archivo: form.archivo || null,
      archivo_path: form.archivoPath || null,
      archivo_url: form.archivoUrl || null,
      archivo_tipo: form.archivoTipo || null,
      archivo_size: form.archivoSize || null,
      link_estudio: form.linkEstudio || null,
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

  return mapPacienteEstudio(data);
}

export async function deletePacienteEstudio(id) {
  const { error } = await supabase
    .from("pacientes_estudios")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function updateEstadoPacienteEstudio(id, estado) {
  const { data, error } = await supabase
    .from("pacientes_estudios")
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

  return mapPacienteEstudio(data);
}