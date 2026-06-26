import { supabase } from "../lib/supabaseClient";
import { getDbSedeId } from "../utils/sedeUtils";

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeDocument(value) {
  return String(value || "").replace(/\D/g, "");
}

function toNumber(value) {
  return Number(value || 0);
}

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function formatVoucher(puntoVenta, numero) {
  if (!puntoVenta || !numero) return "";
  return `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

function mapEntidad(row) {
  if (!row) return null;
  return {
    id: row.id,
    tipo: row.tipo,
    nombre: row.nombre,
    documento: row.documento,
    condicionIva: row.condicion_iva,
    email: row.email,
    telefono: row.telefono,
    domicilio: row.domicilio,
    activa: row.activa,
  };
}

function mapMovimiento(row, saldoAcumulado = null) {
  const entidad = mapEntidad(row.entidades_cuenta_corriente);
  return {
    id: row.id,
    entidadId: row.entidad_id,
    entidad,
    fecha: row.fecha,
    tipoEntidad: row.tipo_entidad,
    tipoMovimiento: row.tipo_movimiento,
    origen: row.origen,
    origenId: row.origen_id,
    descripcion: row.descripcion,
    comprobante: row.comprobante,
    debe: round2(row.debe),
    haber: round2(row.haber),
    saldo: saldoAcumulado === null ? round2(row.saldo) : round2(saldoAcumulado),
    estado: row.estado,
    sedeId: row.sede_id,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

export async function getEntidadesCuentaCorriente({ tipo, search, activa } = {}) {
  let query = supabase
    .from("entidades_cuenta_corriente")
    .select("*")
    .order("nombre", { ascending: true });

  if (tipo && tipo !== "todos") query = query.eq("tipo", tipo);
  if (typeof activa === "boolean") query = query.eq("activa", activa);
  if (search?.trim()) {
    const term = search.trim();
    query = query.or(`nombre.ilike.%${term}%,documento.ilike.%${term}%,email.ilike.%${term}%,telefono.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapEntidad);
}

export async function upsertEntidadCuentaCorriente(payload) {
  const tipo = payload?.tipo || "cliente";
  const nombre = String(payload?.nombre || "").trim();
  const documento = normalizeDocument(payload?.documento) || null;

  if (!nombre) throw new Error("El nombre de la entidad es requerido.");

  const dbPayload = {
    tipo,
    nombre,
    documento,
    condicion_iva: payload?.condicionIva || null,
    email: payload?.email || null,
    telefono: payload?.telefono || null,
    domicilio: payload?.domicilio || null,
    activa: payload?.activa ?? true,
    updated_at: new Date().toISOString(),
  };

  if (payload?.id) {
    const { data, error } = await supabase
      .from("entidades_cuenta_corriente")
      .update(dbPayload)
      .eq("id", payload.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapEntidad(data);
  }

  let existente = null;
  if (documento) {
    const { data, error } = await supabase
      .from("entidades_cuenta_corriente")
      .select("*")
      .eq("tipo", tipo)
      .eq("documento", documento)
      .maybeSingle();
    if (error) throw error;
    existente = data;
  } else {
    const { data, error } = await supabase
      .from("entidades_cuenta_corriente")
      .select("*")
      .eq("tipo", tipo);
    if (error) throw error;
    existente = (data || []).find((item) => normalizeText(item.nombre) === normalizeText(nombre));
  }

  if (existente?.id) {
    const { data, error } = await supabase
      .from("entidades_cuenta_corriente")
      .update(dbPayload)
      .eq("id", existente.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapEntidad(data);
  }

  const { data, error } = await supabase
    .from("entidades_cuenta_corriente")
    .insert(dbPayload)
    .select("*")
    .single();

  if (error) throw error;
  return mapEntidad(data);
}

export async function setEntidadCuentaCorrienteActiva(id, activa) {
  if (!id) throw new Error("La entidad es requerida.");

  const { data, error } = await supabase
    .from("entidades_cuenta_corriente")
    .update({ activa: Boolean(activa), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapEntidad(data);
}

export async function getOrCreateEntidadDesdeCliente(invoiceOrIngreso) {
  const item = invoiceOrIngreso || {};
  const nombre =
    item.cliente_nombre || item.clienteNombre || item.sociedad || item.nombre;
  if (!nombre) return null;

  return upsertEntidadCuentaCorriente({
    tipo: "cliente",
    nombre,
    documento: item.cliente_documento || item.clienteDocumento || item.documento,
    condicionIva: item.cliente_iva || item.clienteIva || item.condicionIva,
    domicilio: item.domicilio,
    email: item.email,
  });
}

export async function getOrCreateEntidadDesdeProveedor(egresoOrOrden) {
  const item = egresoOrOrden || {};
  const nombre = item.proveedor || item.sociedad || item.nombre;
  if (!nombre) return null;

  return upsertEntidadCuentaCorriente({
    tipo: "proveedor",
    nombre,
    documento:
      item.proveedor_cuit ||
      item.proveedorCuit ||
      item.factura_cuit ||
      item.datosFiscales?.cuit,
    domicilio: item.domicilio,
  });
}

export async function crearMovimientoCuentaCorriente(payload) {
  const debe = round2(payload?.debe);
  const haber = round2(payload?.haber);

  if (!payload?.entidadId) throw new Error("La entidad es requerida.");
  if (!payload?.fecha) throw new Error("La fecha es requerida.");
  if (!payload?.tipoEntidad) throw new Error("El tipo de entidad es requerido.");
  if (!payload?.tipoMovimiento) throw new Error("El tipo de movimiento es requerido.");
  if (!payload?.origen) throw new Error("El origen es requerido.");
  if (!payload?.descripcion) throw new Error("La descripcion es requerida.");
  if (debe < 0 || haber < 0) throw new Error("Debe y haber no pueden ser negativos.");
  if ((debe > 0 && haber > 0) || (debe === 0 && haber === 0)) {
    throw new Error("El movimiento debe tener debe o haber, pero no ambos.");
  }

  if (payload.origenId) {
    const { data: existente, error: existenteError } = await supabase
      .from("cuenta_corriente_movimientos")
      .select("*")
      .eq("origen", payload.origen)
      .eq("origen_id", payload.origenId)
      .eq("tipo_movimiento", payload.tipoMovimiento)
      .neq("estado", "anulado")
      .maybeSingle();
    if (existenteError) throw existenteError;
    if (existente) return { skipped: true, movimiento: mapMovimiento(existente) };
  }

  const { data, error } = await supabase
    .from("cuenta_corriente_movimientos")
    .insert({
      entidad_id: payload.entidadId,
      fecha: payload.fecha,
      tipo_entidad: payload.tipoEntidad,
      tipo_movimiento: payload.tipoMovimiento,
      origen: payload.origen,
      origen_id: payload.origenId || null,
      descripcion: payload.descripcion,
      comprobante: payload.comprobante || null,
      debe,
      haber,
      estado: payload.estado || "pendiente",
      sede_id: getDbSedeId(payload.sedeId),
      metadata: payload.metadata || {},
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return { skipped: true };
    throw error;
  }

  return { skipped: false, movimiento: mapMovimiento(data) };
}

export async function getMovimientosCuentaCorriente({
  entidadId,
  tipoEntidad,
  desde,
  hasta,
  sedeId,
} = {}) {
  let query = supabase
    .from("cuenta_corriente_movimientos")
    .select("*, entidades_cuenta_corriente (*)")
    .neq("estado", "anulado")
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  if (entidadId) query = query.eq("entidad_id", entidadId);
  if (tipoEntidad && tipoEntidad !== "todos") query = query.eq("tipo_entidad", tipoEntidad);
  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);
  const idParaFiltro = getDbSedeId(sedeId);
  if (idParaFiltro) query = query.eq("sede_id", idParaFiltro);

  const { data, error } = await query;
  if (error) throw error;

  const saldos = new Map();
  return (data || []).map((row) => {
    const current = toNumber(saldos.get(row.entidad_id));
    const next = round2(current + toNumber(row.debe) - toNumber(row.haber));
    saldos.set(row.entidad_id, next);
    return mapMovimiento(row, next);
  });
}

export async function getResumenCuentasCorrientes(filters = {}) {
  const movimientos = await getMovimientosCuentaCorriente(filters);
  const resumen = new Map();

  movimientos.forEach((mov) => {
    if (!resumen.has(mov.entidadId)) {
      resumen.set(mov.entidadId, {
        entidadId: mov.entidadId,
        tipoEntidad: mov.tipoEntidad,
        nombre: mov.entidad?.nombre || "-",
        documento: mov.entidad?.documento || "",
        totalDebe: 0,
        totalHaber: 0,
        saldo: 0,
        cantidadMovimientos: 0,
      });
    }

    const item = resumen.get(mov.entidadId);
    item.totalDebe = round2(item.totalDebe + mov.debe);
    item.totalHaber = round2(item.totalHaber + mov.haber);
    item.saldo = round2(item.totalDebe - item.totalHaber);
    item.cantidadMovimientos += 1;
  });

  return [...resumen.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function anularMovimientoCuentaCorriente(id) {
  const { data, error } = await supabase
    .from("cuenta_corriente_movimientos")
    .update({ estado: "anulado", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapMovimiento(data);
}
