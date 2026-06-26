// src/services/bancoService.js
import { supabase } from "../lib/supabaseClient";
import {
  registrarAsientoConciliacionEgreso,
  registrarAsientoConciliacionIngreso,
} from "./contabilidadAutomationService";
import { validarPeriodoAbierto } from "./contabilidadService";
import { registrarAuditoria, registrarCambioSeguro } from "./auditoriaService";
import { getDbSedeId } from "../utils/sedeUtils";

function formatFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function mapMovimiento(row) {
  return {
    id: row.id,
    fecha: formatFecha(row.fecha),
    fechaDb: row.fecha,
    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Todas las sedes",
    cuenta: row.cuenta,
    tipo: row.tipo,
    descripcion: row.descripcion,
    importe: Number(row.importe || 0),
    origen: row.origen,
    estado: row.estado,

    externalHash: row.external_hash || null,
    metadata: row.metadata || {},

    ingresoId: row.ingreso_id || null,
    egresoId: row.egreso_id || null,
  };
}

function mapIngresoContable(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    fechaDb: row.fecha,
    sedeId: row.sede_id,
    concepto: row.concepto,
    sociedad: row.sociedad,
    importe: Number(row.importe || 0),
    cobro: row.cobro,
    estado: row.estado,
  };
}

function mapEgresoContable(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    fechaDb: row.fecha,
    sedeId: row.sede_id,
    proveedor: row.proveedor,
    concepto: row.concepto,
    importe: Number(row.importe || 0),
    categoria: row.categoria,
    estado: row.estado,
  };
}

async function getMovimientoById(id) {
  const { data, error } = await supabase
    .from("movimientos_bancarios")
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .eq("id", id)
    .single();

  if (error) throw error;

  return mapMovimiento(data);
}

async function getIngresoById(id) {
  const { data, error } = await supabase
    .from("ingresos")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;

  return mapIngresoContable(data);
}

async function getEgresoById(id) {
  const { data, error } = await supabase
    .from("egresos")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;

  return mapEgresoContable(data);
}

export async function getMovimientosBancarios(sedeId = null) {
  const idParaFiltro = getDbSedeId(sedeId);

  let query = supabase
    .from("movimientos_bancarios")
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

  return (data || []).map(mapMovimiento);
}

export async function getMovimientosBancariosByHashes(hashes = []) {
  const cleanHashes = [...new Set((hashes || []).filter(Boolean))];

  if (cleanHashes.length === 0) return [];

  const { data, error } = await supabase
    .from("movimientos_bancarios")
    .select(`
      id,
      fecha,
      sede_id,
      cuenta,
      tipo,
      descripcion,
      importe,
      origen,
      estado,
      external_hash,
      metadata,
      sedes (
        id,
        nombre
      )
    `)
    .in("external_hash", cleanHashes);

  if (error) throw error;

  return (data || []).map(mapMovimiento);
}

function buildMovimientoPayload(form) {
  return {
    fecha: form.fecha,
    sede_id: getDbSedeId(form.sedeId),
    cuenta: form.cuenta,
    tipo: form.tipo,
    descripcion: form.descripcion,
    importe: Number(form.importe || 0),
    origen: form.origen || "Carga manual",
    estado: form.estado || "Pendiente",
    external_hash: form.externalHash || null,
    metadata: form.metadata || {},
  };
}

export async function createMovimientoBancario(form) {
  await validarPeriodoAbierto(form.fecha);
  const payload = buildMovimientoPayload(form);

  const { data, error } = await supabase
    .from("movimientos_bancarios")
    .insert(payload)
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Este movimiento ya fue importado anteriormente.");
    }

    throw error;
  }

  const movimiento = mapMovimiento(data);
  await registrarAuditoria({
    modulo: "Bancos",
    accion: "crear_movimiento",
    entidad: "movimiento_bancario",
    entidadId: movimiento.id,
    descripcion: `Se creó el movimiento bancario ${movimiento.descripcion || movimiento.id}.`,
    datosDespues: movimiento,
  });

  return true;
}

export async function createMovimientosBancariosBulk(movimientos = []) {
  if (!Array.isArray(movimientos) || movimientos.length === 0) return true;

  for (const movimiento of movimientos) {
    await validarPeriodoAbierto(movimiento.fecha);
  }

  const payload = movimientos.map(buildMovimientoPayload);
  const chunkSize = 50;

  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);

    const { error } = await supabase
      .from("movimientos_bancarios")
      .insert(chunk);

    if (error) {
      if (error.code === "23505") {
        throw new Error("Uno o más movimientos ya fueron importados anteriormente.");
      }

      throw error;
    }
  }

  return true;
}

export async function deleteMovimientoBancario(id) {
  const antes = await getMovimientoById(id);
  const { error } = await supabase
    .from("movimientos_bancarios")
    .delete()
    .eq("id", id);

  if (error) throw error;

  await registrarAuditoria({
    modulo: "Bancos",
    accion: "eliminar_movimiento",
    entidad: "movimiento_bancario",
    entidadId: id,
    descripcion: `Se eliminó el movimiento bancario ${antes.descripcion || id}.`,
    severidad: "warning",
    datosAntes: antes,
  });
}

/* =========================================================
   CONCILIACIÓN REAL
   ========================================================= */

export async function conciliarConIngreso(movimientoId, ingresoId) {
  const movimientoActual = await getMovimientoById(movimientoId);
  await validarPeriodoAbierto(movimientoActual.fechaDb || movimientoActual.fecha);

  const { error: errorMovimiento } = await supabase
    .from("movimientos_bancarios")
    .update({
      estado: "Conciliado",
      ingreso_id: ingresoId,
      egreso_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", movimientoId);

  if (errorMovimiento) throw errorMovimiento;

  const { error: errorIngreso } = await supabase
    .from("ingresos")
    .update({
      estado: "Cobrado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingresoId);

  if (errorIngreso) throw errorIngreso;

  const [movimiento, ingreso] = await Promise.all([
    getMovimientoById(movimientoId),
    getIngresoById(ingresoId),
  ]);

  await registrarAsientoConciliacionIngreso(movimiento, ingreso);

  await registrarCambioSeguro({
    modulo: "Bancos",
    accion: "conciliar_ingreso",
    entidad: "movimiento_bancario",
    entidadId: movimientoId,
    descripcion: `Se concilió el movimiento bancario ${movimiento.descripcion || movimientoId} con un ingreso.`,
    antes: movimientoActual,
    despues: { movimiento, ingreso },
  });
}

export async function conciliarConEgreso(movimientoId, egresoId) {
  const movimientoActual = await getMovimientoById(movimientoId);
  await validarPeriodoAbierto(movimientoActual.fechaDb || movimientoActual.fecha);

  const { error: errorMovimiento } = await supabase
    .from("movimientos_bancarios")
    .update({
      estado: "Conciliado",
      egreso_id: egresoId,
      ingreso_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", movimientoId);

  if (errorMovimiento) throw errorMovimiento;

  const { error: errorEgreso } = await supabase
    .from("egresos")
    .update({
      estado: "Pagado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", egresoId);

  if (errorEgreso) throw errorEgreso;

  const [movimiento, egreso] = await Promise.all([
    getMovimientoById(movimientoId),
    getEgresoById(egresoId),
  ]);

  await registrarAsientoConciliacionEgreso(movimiento, egreso);

  await registrarCambioSeguro({
    modulo: "Bancos",
    accion: "conciliar_egreso",
    entidad: "movimiento_bancario",
    entidadId: movimientoId,
    descripcion: `Se concilió el movimiento bancario ${movimiento.descripcion || movimientoId} con un egreso.`,
    antes: movimientoActual,
    despues: { movimiento, egreso },
  });
}

/* =========================================================
   UTILIDADES
   ========================================================= */

export async function desconciliarMovimiento(movimientoId) {
  const movimientoActual = await getMovimientoById(movimientoId);
  await validarPeriodoAbierto(movimientoActual.fechaDb || movimientoActual.fecha);

  const { error } = await supabase
    .from("movimientos_bancarios")
    .update({
      estado: "Pendiente",
      ingreso_id: null,
      egreso_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", movimientoId);

  if (error) throw error;

  const movimiento = await getMovimientoById(movimientoId);
  await registrarAuditoria({
    modulo: "Bancos",
    accion: "desconciliar",
    entidad: "movimiento_bancario",
    entidadId: movimientoId,
    descripcion: `Se desconcilió el movimiento bancario ${movimientoActual.descripcion || movimientoId}.`,
    severidad: "warning",
    datosAntes: movimientoActual,
    datosDespues: movimiento,
  });
}

export async function conciliarMovimientosPendientes() {
  const movimientos = await getMovimientosBancarios();

  for (const movimiento of movimientos.filter((item) => item.estado === "Pendiente")) {
    await validarPeriodoAbierto(movimiento.fechaDb || movimiento.fecha);
  }

  const { error } = await supabase
    .from("movimientos_bancarios")
    .update({
      estado: "Conciliado",
      updated_at: new Date().toISOString(),
    })
    .eq("estado", "Pendiente");

  if (error) throw error;
}

// Aliases para compatibilidad con Bancos.jsx
export const conciliarMovimientoConIngreso = conciliarConIngreso;
export const conciliarMovimientoConEgreso = conciliarConEgreso;
export const desconciliarMovimientoBancario = desconciliarMovimiento;
