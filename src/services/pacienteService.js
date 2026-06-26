import { supabase } from "../lib/supabaseClient";
import { getDbSedeId } from "../utils/sedeUtils";

function formatFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);

  return date.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
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

function mapPacienteLog(row) {
  return {
    id: row.id,
    pacienteEstudioId: row.paciente_estudio_id,
    accion: row.accion,
    estadoAnterior: row.estado_anterior || "",
    estadoNuevo: row.estado_nuevo || "",
    usuarioNombre: row.usuario_nombre || "",
    usuarioEmail: row.usuario_email || "",
    detalle: row.detalle || "",
    createdAt: row.created_at,
    createdAtText: formatDateTime(row.created_at),
  };
}

function getUserMeta(usuario) {
  return {
    usuario_nombre:
      usuario?.nombre ||
      usuario?.name ||
      usuario?.email ||
      usuario?.user_metadata?.nombre ||
      "Usuario",
    usuario_email: usuario?.email || usuario?.user_metadata?.email || null,
  };
}

export async function getPacientesEstudios(sedeId = null) {
  const idParaFiltro = getDbSedeId(sedeId);

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

export async function getPacienteEstudioLog(pacienteEstudioId) {
  const { data, error } = await supabase
    .from("pacientes_estudios_log")
    .select("*")
    .eq("paciente_estudio_id", pacienteEstudioId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data.map(mapPacienteLog);
}

export async function registrarPacienteEstudioLog({
  pacienteEstudioId,
  accion,
  estadoAnterior = null,
  estadoNuevo = null,
  usuario = null,
  detalle = null,
}) {
  const userMeta = getUserMeta(usuario);

  const { error } = await supabase.from("pacientes_estudios_log").insert({
    paciente_estudio_id: pacienteEstudioId,
    accion,
    estado_anterior: estadoAnterior,
    estado_nuevo: estadoNuevo,
    usuario_nombre: userMeta.usuario_nombre,
    usuario_email: userMeta.usuario_email,
    detalle,
  });

  if (error) throw error;
}

export async function createPacienteEstudio(form, usuario = null) {
  const { data, error } = await supabase
    .from("pacientes_estudios")
    .insert({
      fecha: form.fecha,
      paciente: form.paciente,
      dni: form.dni,
      obra_social: form.obraSocial || null,
      sede_id: getDbSedeId(form.sedeId),
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

  await registrarPacienteEstudioLog({
    pacienteEstudioId: data.id,
    accion: "Creación de orden",
    estadoAnterior: null,
    estadoNuevo: data.estado,
    usuario,
    detalle: "Se creó la orden de estudio.",
  });

  return mapPacienteEstudio(data);
}

export async function updatePacienteEstudio(id, form, usuario = null, detalle = null) {
  const { data: actual, error: actualError } = await supabase
    .from("pacientes_estudios")
    .select("*")
    .eq("id", id)
    .single();

  if (actualError) throw actualError;

  const { data, error } = await supabase
    .from("pacientes_estudios")
    .update({
      fecha: form.fecha,
      paciente: form.paciente,
      dni: form.dni,
      obra_social: form.obraSocial || null,
      sede_id: getDbSedeId(form.sedeId),
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

  await registrarPacienteEstudioLog({
    pacienteEstudioId: id,
    accion: "Edición de orden",
    estadoAnterior: actual.estado,
    estadoNuevo: data.estado,
    usuario,
    detalle: detalle || "Se editaron datos de la orden.",
  });

  return mapPacienteEstudio(data);
}

export async function deletePacienteEstudio(id) {
  const { error } = await supabase
    .from("pacientes_estudios")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function updateEstadoPacienteEstudio(id, estado, usuario = null) {
  const { data: actual, error: actualError } = await supabase
    .from("pacientes_estudios")
    .select("estado")
    .eq("id", id)
    .single();

  if (actualError) throw actualError;

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

  await registrarPacienteEstudioLog({
    pacienteEstudioId: id,
    accion: "Cambio de estado",
    estadoAnterior: actual.estado,
    estadoNuevo: estado,
    usuario,
    detalle: `Estado actualizado de "${actual.estado}" a "${estado}".`,
  });

  return mapPacienteEstudio(data);
}
