import { supabase } from "../lib/supabaseClient";

const DEFAULT_SEVERIDAD = "info";
const VALID_SEVERIDADES = new Set(["info", "warning", "error", "critical"]);
const MAX_JSON_LENGTH = 50000;

async function getCurrentUserInfo() {
  const { data } = await supabase.auth.getUser();
  return {
    userId: data?.user?.id || null,
    email: data?.user?.email || null,
  };
}

function sanitizeJson(value) {
  try {
    if (value === undefined || value === null || value === "") return null;
    const sanitized = JSON.parse(JSON.stringify(value));
    const serialized = JSON.stringify(sanitized);
    if (serialized.length > MAX_JSON_LENGTH) {
      return {
        resumen: "Payload omitido por tamano.",
        bytesEstimados: serialized.length,
      };
    }
    return sanitized;
  } catch {
    return null;
  }
}

function normalizeEvento(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    usuarioId: row.usuario_id,
    usuarioEmail: row.usuario_email,
    modulo: row.modulo,
    accion: row.accion,
    entidad: row.entidad,
    entidadId: row.entidad_id,
    descripcion: row.descripcion,
    severidad: row.severidad,
    datosAntes: row.datos_antes,
    datosDespues: row.datos_despues,
    metadata: row.metadata || {},
  };
}

export async function registrarAuditoria(evento = {}) {
  try {
    const modulo = String(evento.modulo || "").trim();
    const accion = String(evento.accion || "").trim();
    const entidad = String(evento.entidad || "").trim();
    const descripcion = String(evento.descripcion || "").trim();

    if (!modulo || !accion || !entidad || !descripcion) {
      console.error("Auditoria incompleta:", evento);
      return { ok: false };
    }

    const userInfo = await getCurrentUserInfo();
    const severidad = VALID_SEVERIDADES.has(evento.severidad)
      ? evento.severidad
      : DEFAULT_SEVERIDAD;
    const payload = {
      usuario_id: userInfo.userId,
      usuario_email: userInfo.email,
      modulo,
      accion,
      entidad,
      entidad_id: evento.entidadId || null,
      descripcion,
      severidad,
      datos_antes: sanitizeJson(evento.datosAntes),
      datos_despues: sanitizeJson(evento.datosDespues),
      metadata: sanitizeJson(evento.metadata) || {},
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    };

    const { data, error } = await supabase
      .from("auditoria_eventos")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;
    return { ok: true, evento: data ? normalizeEvento(data) : payload };
  } catch (error) {
    console.error("No se pudo registrar auditoria:", error);
    return { ok: false };
  }
}

export async function getAuditoriaEventos({
  desde,
  hasta,
  modulo,
  accion,
  entidad,
  usuarioEmail,
  severidad,
  search,
} = {}) {
  let query = supabase
    .from("auditoria_eventos")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(500);

  if (desde) query = query.gte("fecha", `${desde}T00:00:00`);
  if (hasta) query = query.lte("fecha", `${hasta}T23:59:59`);
  if (modulo && modulo !== "todos") query = query.eq("modulo", modulo);
  if (accion && accion !== "todos") query = query.eq("accion", accion);
  if (entidad && entidad !== "todos") query = query.eq("entidad", entidad);
  if (severidad && severidad !== "todos") query = query.eq("severidad", severidad);
  if (usuarioEmail) query = query.ilike("usuario_email", `%${usuarioEmail}%`);
  if (search) {
    const term = String(search).replace(/[%(),]/g, " ").trim();
    if (term) {
      query = query.or(
        `descripcion.ilike.%${term}%,usuario_email.ilike.%${term}%,modulo.ilike.%${term}%,accion.ilike.%${term}%,entidad.ilike.%${term}%`
      );
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeEvento);
}

export async function getResumenAuditoria({ desde, hasta } = {}) {
  const eventos = await getAuditoriaEventos({ desde, hasta });
  const increment = (target, key) => {
    const cleanKey = key || "Sin dato";
    target[cleanKey] = (target[cleanKey] || 0) + 1;
  };
  const resumen = {
    totalEventos: eventos.length,
    porSeveridad: {},
    porModulo: {},
    porAccion: {},
    usuariosActivos: 0,
  };
  const usuarios = new Set();

  eventos.forEach((evento) => {
    increment(resumen.porSeveridad, evento.severidad);
    increment(resumen.porModulo, evento.modulo);
    increment(resumen.porAccion, evento.accion);
    if (evento.usuarioEmail || evento.usuarioId) {
      usuarios.add(evento.usuarioEmail || evento.usuarioId);
    }
  });

  resumen.usuariosActivos = usuarios.size;
  return resumen;
}

export function registrarCambioSeguro({
  modulo,
  accion,
  entidad,
  entidadId,
  descripcion,
  antes,
  despues,
  metadata,
}) {
  return registrarAuditoria({
    modulo,
    accion,
    entidad,
    entidadId,
    descripcion,
    severidad: "info",
    datosAntes: antes,
    datosDespues: despues,
    metadata,
  });
}

export function registrarAlertaAuditoria({
  modulo,
  accion,
  entidad,
  entidadId,
  descripcion,
  metadata,
  datosAntes,
  datosDespues,
}) {
  return registrarAuditoria({
    modulo,
    accion,
    entidad,
    entidadId,
    descripcion,
    severidad: "warning",
    datosAntes,
    datosDespues,
    metadata,
  });
}

export function registrarErrorAuditoria({
  modulo,
  accion,
  entidad,
  entidadId,
  descripcion,
  metadata,
}) {
  return registrarAuditoria({
    modulo,
    accion,
    entidad,
    entidadId,
    descripcion,
    severidad: "error",
    metadata,
  });
}
