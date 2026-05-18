// src/services/bancoService.js
import { supabase } from "../lib/supabaseClient";

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

export async function getMovimientosBancarios(sedeId = null) {
  const idParaFiltro = sedeId === "todas" ? null : sedeId;

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
    sede_id: form.sedeId || null,
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
  const payload = buildMovimientoPayload(form);

  const { error } = await supabase
    .from("movimientos_bancarios")
    .insert(payload);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Este movimiento ya fue importado anteriormente.");
    }

    throw error;
  }

  return true;
}

export async function createMovimientosBancariosBulk(movimientos = []) {
  if (!Array.isArray(movimientos) || movimientos.length === 0) return true;

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
  const { error } = await supabase
    .from("movimientos_bancarios")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

/* =========================================================
   CONCILIACIÓN REAL
   ========================================================= */

export async function conciliarConIngreso(movimientoId, ingresoId) {
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
}

export async function conciliarConEgreso(movimientoId, egresoId) {
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
}

/* =========================================================
   UTILIDADES
   ========================================================= */

export async function desconciliarMovimiento(movimientoId) {
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
}

export async function conciliarMovimientosPendientes() {
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