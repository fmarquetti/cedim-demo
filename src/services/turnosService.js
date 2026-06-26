// src/services/turnosService.js
import { supabase } from "../lib/supabaseClient";
import { getDbSedeId } from "../utils/sedeUtils";

function formatFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatHora(fechaHora) {
  if (!fechaHora) return "";
  return new Date(fechaHora).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTodayDbDate() {
  return new Date().toISOString().slice(0, 10);
}

function mapTurno(row) {
  return {
    id: row.id,

    fecha: formatFecha(row.fecha),
    fechaDb: row.fecha,
    horaIngreso: formatHora(row.hora_ingreso),
    horaIngresoDb: row.hora_ingreso,

    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Sin sede",

    pacienteId: row.paciente_id,
    pacienteNombre: row.paciente_nombre,
    dni: row.dni || "",
    telefono: row.telefono || "",
    obraSocial: row.obra_social || "",

    tipoAtencion: row.tipo_atencion,
    area: row.area || "",
    consultorio: row.consultorio || "",
    motivo: row.motivo || "",

    prioridad: row.prioridad,
    estado: row.estado,

    llamadoEn: row.llamado_en,
    llamadoHora: formatHora(row.llamado_en),

    atencionInicio: row.atencion_inicio,
    atencionInicioHora: formatHora(row.atencion_inicio),

    atencionFin: row.atencion_fin,
    atencionFinHora: formatHora(row.atencion_fin),

    observaciones: row.observaciones || "",

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildBaseQuery() {
  return supabase.from("turnos").select(`
    *,
    sedes (
      id,
      nombre
    )
  `);
}

export async function getTurnosDelDia({ sedeId = null, fecha = null } = {}) {
  const fechaConsulta = fecha || getTodayDbDate();
  const idParaFiltro = getDbSedeId(sedeId);

  let query = buildBaseQuery()
    .eq("fecha", fechaConsulta)
    .order("prioridad", { ascending: false })
    .order("hora_ingreso", { ascending: true });

  if (idParaFiltro) {
    query = query.eq("sede_id", idParaFiltro);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data.map(mapTurno);
}

export async function getTurnosActivos({ sedeId = null, fecha = null } = {}) {
  const fechaConsulta = fecha || getTodayDbDate();
  const idParaFiltro = getDbSedeId(sedeId);

  let query = buildBaseQuery()
    .eq("fecha", fechaConsulta)
    .in("estado", ["En espera", "Llamado", "En atención"])
    .order("prioridad", { ascending: false })
    .order("hora_ingreso", { ascending: true });

  if (idParaFiltro) {
    query = query.eq("sede_id", idParaFiltro);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data.map(mapTurno);
}

export async function createTurno(form) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload = {
    fecha: form.fecha || getTodayDbDate(),
    sede_id: getDbSedeId(form.sedeId),

    paciente_id: form.pacienteId || null,
    paciente_nombre: form.pacienteNombre,
    dni: form.dni || null,
    telefono: form.telefono || null,
    obra_social: form.obraSocial || null,

    tipo_atencion: form.tipoAtencion,
    area: form.area || null,
    consultorio: form.consultorio || null,
    motivo: form.motivo || null,

    prioridad: form.prioridad || "Normal",
    estado: "En espera",

    observaciones: form.observaciones || null,

    created_by: user?.id || null,
    updated_by: user?.id || null,
  };

  const { data, error } = await supabase
    .from("turnos")
    .insert(payload)
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .single();

  if (error) throw error;

  return mapTurno(data);
}

export async function updateEstadoTurno(id, estado) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();

  const payload = {
    estado,
    updated_by: user?.id || null,
  };

  if (estado === "Llamado") {
    payload.llamado_en = now;
  }

  if (estado === "En atención") {
    payload.atencion_inicio = now;
  }

  if (estado === "Finalizado") {
    payload.atencion_fin = now;
  }

  const { data, error } = await supabase
    .from("turnos")
    .update(payload)
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

  return mapTurno(data);
}

export async function llamarTurno(id) {
  return updateEstadoTurno(id, "Llamado");
}

export async function iniciarAtencionTurno(id) {
  return updateEstadoTurno(id, "En atención");
}

export async function finalizarTurno(id) {
  return updateEstadoTurno(id, "Finalizado");
}

export async function marcarAusenteTurno(id) {
  return updateEstadoTurno(id, "Ausente");
}

export async function cancelarTurno(id) {
  return updateEstadoTurno(id, "Cancelado");
}

export async function deleteTurno(id) {
  const { error } = await supabase.from("turnos").delete().eq("id", id);

  if (error) throw error;
}

export function subscribeTurnos(callback) {
  const channel = supabase
    .channel("turnos-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "turnos",
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function getSedesOptions() {
  const { data, error } = await supabase
    .from("sedes")
    .select("id, nombre")
    .order("nombre", { ascending: true });

  if (error) throw error;

  return data.map((sede) => ({
    id: sede.id,
    nombre: sede.nombre,
  }));
}
