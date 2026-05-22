import { supabase } from "../lib/supabaseClient";
import { registrarAuditoria, registrarCambioSeguro } from "./auditoriaService";

const CUENTAS_POR_DEFECTO = {
  caja: "1.1.01",
  bancos: "1.1.02",
  clientes: "1.1.03",
  proveedores: "2.1.01",
  ivaDebito: "2.1.02",
  ivaCredito: "2.1.03",
  retencionesSufridas: "1.1.05",
  percepcionesSufridas: "1.1.06",
  ventasServicios: "4.1.01",
  compras: "5.1.01",
  gastosAdministrativos: "5.1.02",
  impuestosNoRecuperables: "5.1.07",
  otrosIngresos: "4.1.02",
  otrosEgresos: "5.1.06",
};

function isDuplicateAsientoError(error) {
  return error?.code === "23505";
}

function toNumber(value) {
  return Number(value || 0);
}

function toMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

function getSedeId(sedeId) {
  if (!sedeId || sedeId === "todas") return null;
  if (typeof sedeId === "object") return sedeId.id || null;
  return sedeId;
}

function mapCuenta(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    tipo: row.tipo,
    subtipo: row.subtipo,
    cuentaPadreId: row.cuenta_padre_id,
    imputable: row.imputable,
    activa: row.activa,
  };
}

function mapLinea(row) {
  const cuenta = row.contabilidad_cuentas ? mapCuenta(row.contabilidad_cuentas) : null;

  return {
    id: row.id,
    asientoId: row.asiento_id,
    cuentaId: row.cuenta_id,
    cuenta,
    descripcion: row.descripcion,
    debe: toMoney(row.debe),
    haber: toMoney(row.haber),
  };
}

function mapAsiento(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    numero: row.numero,
    concepto: row.concepto,
    origen: row.origen,
    origenId: row.origen_id,
    sedeId: row.sede_id,
    estado: row.estado,
    tipoAsiento: row.tipo_asiento || "automatico",
    observaciones: row.observaciones || "",
    confirmadoAt: row.confirmado_at,
    confirmadoBy: row.confirmado_by,
    anuladoAt: row.anulado_at,
    anuladoBy: row.anulado_by,
    motivoAnulacion: row.motivo_anulacion || "",
    lineas: (row.contabilidad_asiento_lineas || []).map(mapLinea),
  };
}

function mapSaldoInicial(row) {
  const cuenta = row.contabilidad_cuentas || {};

  return {
    id: row.id,
    fechaApertura: row.fecha_apertura,
    cuentaId: row.cuenta_id,
    cuentaCodigo: cuenta.codigo || "",
    cuentaNombre: cuenta.nombre || "",
    cuentaTipo: cuenta.tipo || "",
    sedeId: row.sede_id,
    descripcion: row.descripcion,
    debe: toMoney(row.debe),
    haber: toMoney(row.haber),
    asientoId: row.asiento_id,
    estado: row.estado,
    confirmadoAt: row.confirmado_at,
  };
}

function mapPeriodo(row) {
  return {
    id: row.id,
    anio: row.anio,
    mes: row.mes,
    fechaDesde: row.fecha_desde,
    fechaHasta: row.fecha_hasta,
    estado: row.estado,
    cerradoPor: row.cerrado_por,
    cerradoAt: row.cerrado_at,
    observaciones: row.observaciones,
  };
}

function mapEjercicio(row) {
  return {
    id: row.id,
    anio: row.anio,
    fechaDesde: row.fecha_desde,
    fechaHasta: row.fecha_hasta,
    estado: row.estado,
    resultadoEjercicio: row.resultado_ejercicio === null ? null : toMoney(row.resultado_ejercicio),
    asientoCierreId: row.asiento_cierre_id,
    asientoAperturaId: row.asiento_apertura_id,
    cerradoAt: row.cerrado_at,
    reabiertoAt: row.reabierto_at,
    observaciones: row.observaciones,
  };
}

function validarAnioMes(anio, mes) {
  const year = Number(anio);
  const month = Number(mes);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("El año del período no es válido.");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("El mes del período no es válido.");
  }

  return { year, month };
}

function getPeriodoFechas(anio, mes) {
  const { year, month } = validarAnioMes(anio, mes);
  const mm = String(month).padStart(2, "0");
  const hasta = new Date(Date.UTC(year, month, 0)).toISOString().split("T")[0];

  return {
    fechaDesde: `${year}-${mm}-01`,
    fechaHasta: hasta,
  };
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().split("T")[0];
  return String(value).includes("T") ? String(value).split("T")[0] : String(value);
}

function validarLinea(linea, index) {
  if (!linea?.cuentaId) {
    throw new Error(`La linea ${index + 1} no tiene cuenta contable.`);
  }

  const debe = toMoney(linea.debe);
  const haber = toMoney(linea.haber);

  if (debe < 0 || haber < 0) {
    throw new Error(`La linea ${index + 1} no puede tener importes negativos.`);
  }

  if (debe > 0 && haber > 0) {
    throw new Error(`La linea ${index + 1} no puede tener debe y haber al mismo tiempo.`);
  }

  if (debe === 0 && haber === 0) {
    throw new Error(`La linea ${index + 1} debe tener importe en debe o haber.`);
  }
}

export function validarLineasAsiento(lineasInput) {
  const lineas = Array.isArray(lineasInput) ? lineasInput : [];

  if (lineas.length < 2) {
    throw new Error("El asiento debe tener al menos 2 lineas.");
  }

  lineas.forEach(validarLinea);

  const totalDebe = toMoney(lineas.reduce((acc, item) => acc + toNumber(item.debe), 0));
  const totalHaber = toMoney(lineas.reduce((acc, item) => acc + toNumber(item.haber), 0));
  const diferencia = toMoney(totalDebe - totalHaber);

  if (Math.abs(diferencia) > 0.01) {
    throw new Error(`El asiento no balancea: debe ${totalDebe} y haber ${totalHaber}.`);
  }

  return { totalDebe, totalHaber, diferencia };
}

function validarAsiento(payload) {
  if (!payload?.fecha) throw new Error("La fecha del asiento es requerida.");
  if (!payload?.concepto) throw new Error("El concepto del asiento es requerido.");
  if (!payload?.origen) throw new Error("El origen del asiento es requerido.");

  validarLineasAsiento(payload.lineas);
}

export async function getCuentasContables() {
  const { data, error } = await supabase
    .from("contabilidad_cuentas")
    .select("*")
    .order("codigo", { ascending: true });

  if (error) throw error;

  return (data || []).map(mapCuenta);
}

export async function getAsientosContables({ desde, hasta, sedeId, estado, tipoAsiento } = {}) {
  let query = supabase
    .from("contabilidad_asientos")
    .select(`
      *,
      contabilidad_asiento_lineas (
        *,
        contabilidad_cuentas (*)
      )
    `)
    .order("fecha", { ascending: true })
    .order("numero", { ascending: true });

  if (desde) {
    query = query.gte("fecha", desde);
  }

  if (hasta) {
    query = query.lte("fecha", hasta);
  }

  const idParaFiltro = getSedeId(sedeId);

  if (idParaFiltro) {
    query = query.eq("sede_id", idParaFiltro);
  }

  if (estado && estado !== "todos") {
    query = query.eq("estado", estado);
  }

  if (tipoAsiento && tipoAsiento !== "todos") {
    query = query.eq("tipo_asiento", tipoAsiento);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(mapAsiento);
}

export async function crearAsientoContable(payload) {
  validarAsiento(payload);
  await validarPeriodoAbierto(payload.fecha);

  const { data: asiento, error: asientoError } = await supabase
    .from("contabilidad_asientos")
    .insert({
      fecha: payload.fecha,
      concepto: payload.concepto,
      origen: payload.origen,
      origen_id: payload.origenId || null,
      sede_id: getSedeId(payload.sedeId),
      estado: payload.estado || "borrador",
      created_by: payload.createdBy || null,
    })
    .select("*")
    .single();

  if (asientoError) {
    if (isDuplicateAsientoError(asientoError)) {
      return null;
    }

    throw asientoError;
  }

  const lineas = payload.lineas.map((linea) => ({
    asiento_id: asiento.id,
    cuenta_id: linea.cuentaId,
    descripcion: linea.descripcion || null,
    debe: toMoney(linea.debe),
    haber: toMoney(linea.haber),
  }));

  const { error: lineasError } = await supabase
    .from("contabilidad_asiento_lineas")
    .insert(lineas);

  if (lineasError) {
    await supabase.from("contabilidad_asientos").delete().eq("id", asiento.id);
    throw lineasError;
  }

  const asientos = await getAsientosContables({
    desde: asiento.fecha,
    hasta: asiento.fecha,
    sedeId: asiento.sede_id,
  });

  return asientos.find((item) => item.id === asiento.id) || mapAsiento({
    ...asiento,
    contabilidad_asiento_lineas: [],
  });
}

export async function getAsientoContableById(id) {
  const { data, error } = await supabase
    .from("contabilidad_asientos")
    .select(`
      *,
      contabilidad_asiento_lineas (
        *,
        contabilidad_cuentas (*)
      )
    `)
    .eq("id", id)
    .single();

  if (error) throw error;

  return mapAsiento(data);
}

async function getAuthUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

function applySaldoInicialFilters(query, { fechaApertura, sedeId, estado } = {}) {
  let nextQuery = query;
  const idParaFiltro = getSedeId(sedeId);

  if (fechaApertura) nextQuery = nextQuery.eq("fecha_apertura", dateOnly(fechaApertura));
  if (idParaFiltro) nextQuery = nextQuery.eq("sede_id", idParaFiltro);
  if (sedeId !== undefined && !idParaFiltro) nextQuery = nextQuery.is("sede_id", null);
  if (estado) nextQuery = nextQuery.eq("estado", estado);

  return nextQuery;
}

async function assertSinSaldosInicialesConfirmados({ fechaApertura, sedeId }) {
  const { data, error } = await applySaldoInicialFilters(
    supabase.from("contabilidad_saldos_iniciales").select("id").limit(1),
    { fechaApertura, sedeId, estado: "confirmado" }
  ).maybeSingle();

  if (error) throw error;

  if (data?.id) {
    throw new Error("Ya existen saldos iniciales confirmados para esta fecha.");
  }
}

export async function getSaldosIniciales({ fechaApertura, sedeId } = {}) {
  let query = supabase
    .from("contabilidad_saldos_iniciales")
    .select(`
      *,
      contabilidad_cuentas (id, codigo, nombre, tipo)
    `)
    .order("created_at", { ascending: true });

  if (fechaApertura) query = query.eq("fecha_apertura", dateOnly(fechaApertura));

  const idParaFiltro = getSedeId(sedeId);
  if (idParaFiltro) query = query.eq("sede_id", idParaFiltro);

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .map(mapSaldoInicial)
    .sort((a, b) => a.cuentaCodigo.localeCompare(b.cuentaCodigo));
}

async function getSaldosInicialesOperativos({ fechaApertura, sedeId, estado } = {}) {
  const { data, error } = await applySaldoInicialFilters(
    supabase
      .from("contabilidad_saldos_iniciales")
      .select(`
        *,
        contabilidad_cuentas (id, codigo, nombre, tipo)
      `)
      .order("created_at", { ascending: true }),
    { fechaApertura, sedeId: getSedeId(sedeId), estado }
  );

  if (error) throw error;

  return (data || [])
    .map(mapSaldoInicial)
    .sort((a, b) => a.cuentaCodigo.localeCompare(b.cuentaCodigo));
}

export function validarSaldosIniciales(lineasInput) {
  const lineas = Array.isArray(lineasInput) ? lineasInput : [];

  if (lineas.length < 2) {
    throw new Error("Los saldos iniciales deben tener al menos 2 lineas.");
  }

  lineas.forEach(validarLinea);

  const totalDebe = toMoney(lineas.reduce((acc, item) => acc + toNumber(item.debe), 0));
  const totalHaber = toMoney(lineas.reduce((acc, item) => acc + toNumber(item.haber), 0));
  const diferencia = toMoney(totalDebe - totalHaber);

  if (Math.abs(diferencia) > 0.01) {
    throw new Error(`Los saldos iniciales no balancean: debe ${totalDebe} y haber ${totalHaber}.`);
  }

  return { totalDebe, totalHaber, diferencia };
}

export async function guardarSaldosIniciales({ fechaApertura, sedeId, lineas } = {}) {
  if (!fechaApertura) throw new Error("La fecha de apertura es requerida.");

  const fecha = dateOnly(fechaApertura);
  const sede = getSedeId(sedeId);

  await validarPeriodoAbierto(fecha);
  validarSaldosIniciales(lineas);
  await assertSinSaldosInicialesConfirmados({ fechaApertura: fecha, sedeId });

  let deleteQuery = supabase
    .from("contabilidad_saldos_iniciales")
    .delete()
    .eq("fecha_apertura", fecha)
    .eq("estado", "borrador");

  deleteQuery = sede ? deleteQuery.eq("sede_id", sede) : deleteQuery.is("sede_id", null);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  const userId = await getAuthUserId();
  const payload = lineas.map((linea) => ({
    fecha_apertura: fecha,
    cuenta_id: linea.cuentaId,
    sede_id: sede,
    descripcion: linea.descripcion || null,
    debe: toMoney(linea.debe),
    haber: toMoney(linea.haber),
    estado: "borrador",
    created_by: userId,
  }));

  const { error: insertError } = await supabase
    .from("contabilidad_saldos_iniciales")
    .insert(payload);

  if (insertError) throw insertError;

  return getSaldosIniciales({ fechaApertura: fecha, sedeId });
}

export async function confirmarSaldosIniciales({ fechaApertura, sedeId } = {}) {
  if (!fechaApertura) throw new Error("La fecha de apertura es requerida.");

  const fecha = dateOnly(fechaApertura);
  const sede = getSedeId(sedeId);

  await validarPeriodoAbierto(fecha);
  await assertSinSaldosInicialesConfirmados({ fechaApertura: fecha, sedeId });

  const saldos = await getSaldosInicialesOperativos({ fechaApertura: fecha, sedeId: sede });
  const borradores = saldos.filter((saldo) => saldo.estado === "borrador");

  if (!borradores.length) {
    throw new Error("No hay saldos iniciales en borrador para confirmar.");
  }

  validarSaldosIniciales(borradores.map((saldo) => ({
    cuentaId: saldo.cuentaId,
    descripcion: saldo.descripcion,
    debe: saldo.debe,
    haber: saldo.haber,
  })));

  const asiento = await crearAsientoManual({
    fecha,
    concepto: "Asiento de apertura",
    tipoAsiento: "apertura",
    estado: "confirmado",
    sedeId: sede,
    lineas: borradores.map((saldo) => ({
      cuentaId: saldo.cuentaId,
      descripcion: saldo.descripcion || "Saldo inicial",
      debe: saldo.debe,
      haber: saldo.haber,
    })),
  });

  const ids = borradores.map((saldo) => saldo.id);
  const { error: updateError } = await supabase
    .from("contabilidad_saldos_iniciales")
    .update({
      estado: "confirmado",
      asiento_id: asiento.id,
      confirmado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (updateError) {
    console.error("Error confirmando saldos iniciales despues de crear asiento de apertura:", updateError);
    throw updateError;
  }

  const resultado = {
    asiento,
    saldos: await getSaldosIniciales({ fechaApertura: fecha, sedeId }),
  };
  await registrarAuditoria({
    modulo: "Saldos Iniciales",
    accion: "confirmar_saldos_iniciales",
    entidad: "contabilidad_saldo_inicial",
    descripcion: `Se confirmaron saldos iniciales con fecha ${fecha}.`,
    datosAntes: borradores,
    datosDespues: resultado,
  });
  return resultado;
}

export async function anularSaldosIniciales({ fechaApertura, sedeId, motivo } = {}) {
  if (!fechaApertura) throw new Error("La fecha de apertura es requerida.");
  if (!String(motivo || "").trim()) throw new Error("El motivo de anulacion es obligatorio.");

  const fecha = dateOnly(fechaApertura);

  await validarPeriodoAbierto(fecha);

  const saldos = (await getSaldosInicialesOperativos({ fechaApertura: fecha, sedeId: getSedeId(sedeId) }))
    .filter((saldo) => saldo.estado === "confirmado");

  if (!saldos.length) {
    throw new Error("No hay saldos iniciales confirmados para anular.");
  }

  const asientoIds = [...new Set(saldos.map((saldo) => saldo.asientoId).filter(Boolean))];

  for (const asientoId of asientoIds) {
    await anularAsientoManual(asientoId, `Anulacion de saldos iniciales: ${String(motivo).trim()}`);
  }

  const { error } = await supabase
    .from("contabilidad_saldos_iniciales")
    .update({
      estado: "anulado",
      updated_at: new Date().toISOString(),
    })
    .in("id", saldos.map((saldo) => saldo.id));

  if (error) throw error;

  const resultado = await getSaldosIniciales({ fechaApertura: fecha, sedeId });
  await registrarAuditoria({
    modulo: "Saldos Iniciales",
    accion: "anular_saldos_iniciales",
    entidad: "contabilidad_saldo_inicial",
    descripcion: `Se anularon saldos iniciales con fecha ${fecha}.`,
    severidad: "warning",
    datosAntes: saldos,
    datosDespues: resultado,
    metadata: { motivo },
  });
  return resultado;
}

export async function getFechasAperturaDisponibles() {
  const { data, error } = await supabase
    .from("contabilidad_saldos_iniciales")
    .select("fecha_apertura")
    .order("fecha_apertura", { ascending: false });

  if (error) throw error;

  return [...new Set((data || []).map((row) => row.fecha_apertura).filter(Boolean))];
}

function assertManualEditable(asiento) {
  if (asiento.estado !== "borrador") {
    throw new Error("Solo se pueden editar asientos manuales en borrador.");
  }

  if (!["manual", "ajuste"].includes(asiento.origen) || asiento.tipoAsiento === "automatico") {
    throw new Error("No se pueden editar asientos automaticos desde operaciones.");
  }
}

function normalizeTipoAsiento(tipoAsiento) {
  const tipo = tipoAsiento || "manual";
  const permitidos = ["manual", "ajuste", "apertura", "cierre", "reclasificacion", "correccion"];

  if (!permitidos.includes(tipo)) {
    throw new Error("El tipo de asiento manual no es valido.");
  }

  return tipo;
}

function getOrigenManual(tipoAsiento) {
  return tipoAsiento === "manual" ? "manual" : "ajuste";
}

async function insertarLineasAsiento(asientoId, lineas) {
  const payload = lineas.map((linea) => ({
    asiento_id: asientoId,
    cuenta_id: linea.cuentaId,
    descripcion: linea.descripcion || null,
    debe: toMoney(linea.debe),
    haber: toMoney(linea.haber),
  }));

  const { error } = await supabase.from("contabilidad_asiento_lineas").insert(payload);
  if (error) throw error;
}

export async function crearAsientoManual(payload) {
  const tipoAsiento = normalizeTipoAsiento(payload?.tipoAsiento);
  const estado = payload?.estado === "confirmado" ? "confirmado" : "borrador";
  const fecha = dateOnly(payload?.fecha);

  if (!payload?.concepto) throw new Error("El concepto del asiento es requerido.");
  await validarPeriodoAbierto(fecha);
  validarLineasAsiento(payload.lineas);

  const userId = estado === "confirmado" ? await getAuthUserId() : null;
  const { data: asiento, error: asientoError } = await supabase
    .from("contabilidad_asientos")
    .insert({
      fecha,
      concepto: payload.concepto,
      origen: getOrigenManual(tipoAsiento),
      origen_id: null,
      sede_id: getSedeId(payload.sedeId),
      estado,
      tipo_asiento: tipoAsiento,
      observaciones: payload.observaciones || null,
      confirmado_at: estado === "confirmado" ? new Date().toISOString() : null,
      confirmado_by: userId,
      created_by: payload.createdBy || userId,
    })
    .select("*")
    .single();

  if (asientoError) throw asientoError;

  try {
    await insertarLineasAsiento(asiento.id, payload.lineas);
  } catch (error) {
    await supabase.from("contabilidad_asientos").delete().eq("id", asiento.id);
    throw error;
  }

  const creado = await getAsientoContableById(asiento.id);
  await registrarAuditoria({
    modulo: "Contabilidad",
    accion: "crear_asiento_manual",
    entidad: "contabilidad_asiento",
    entidadId: creado.id,
    descripcion: `Se creó el asiento manual ${creado.numero || creado.id}.`,
    datosDespues: creado,
  });
  return creado;
}

export async function actualizarAsientoManual(id, payload) {
  const asiento = await getAsientoContableById(id);
  assertManualEditable(asiento);

  const tipoAsiento = normalizeTipoAsiento(payload?.tipoAsiento || asiento.tipoAsiento);
  const fecha = dateOnly(payload?.fecha || asiento.fecha);

  if (!payload?.concepto) throw new Error("El concepto del asiento es requerido.");
  await validarPeriodoAbierto(fecha);
  validarLineasAsiento(payload.lineas);

  const { error: updateError } = await supabase
    .from("contabilidad_asientos")
    .update({
      fecha,
      concepto: payload.concepto,
      origen: getOrigenManual(tipoAsiento),
      sede_id: getSedeId(payload.sedeId),
      tipo_asiento: tipoAsiento,
      observaciones: payload.observaciones || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from("contabilidad_asiento_lineas")
    .delete()
    .eq("asiento_id", id);

  if (deleteError) throw deleteError;

  await insertarLineasAsiento(id, payload.lineas);
  const actualizado = await getAsientoContableById(id);
  await registrarCambioSeguro({
    modulo: "Contabilidad",
    accion: "actualizar_asiento_manual",
    entidad: "contabilidad_asiento",
    entidadId: id,
    descripcion: `Se actualizó el asiento manual ${actualizado.numero || id}.`,
    antes: asiento,
    despues: actualizado,
  });
  return actualizado;
}

export async function confirmarAsientoManual(id) {
  const asiento = await getAsientoContableById(id);

  if (asiento.estado !== "borrador") {
    throw new Error("Solo se pueden confirmar asientos en borrador.");
  }

  if (!["manual", "ajuste"].includes(asiento.origen) || asiento.tipoAsiento === "automatico") {
    throw new Error("Solo se pueden confirmar asientos manuales o de ajuste.");
  }

  await validarPeriodoAbierto(asiento.fecha);
  validarLineasAsiento(asiento.lineas);

  const userId = await getAuthUserId();
  const { error } = await supabase
    .from("contabilidad_asientos")
    .update({
      estado: "confirmado",
      confirmado_at: new Date().toISOString(),
      confirmado_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

  const confirmado = await getAsientoContableById(id);
  await registrarCambioSeguro({
    modulo: "Contabilidad",
    accion: "confirmar_asiento",
    entidad: "contabilidad_asiento",
    entidadId: id,
    descripcion: `Se confirmó el asiento ${confirmado.numero || id}.`,
    antes: asiento,
    despues: confirmado,
  });
  return confirmado;
}

export async function anularAsientoManual(id, motivo) {
  if (!String(motivo || "").trim()) {
    throw new Error("El motivo de anulacion es obligatorio.");
  }

  const asiento = await getAsientoContableById(id);

  if (asiento.estado === "anulado") {
    throw new Error("El asiento ya esta anulado.");
  }

  await validarPeriodoAbierto(asiento.fecha);

  const userId = await getAuthUserId();
  const { error } = await supabase
    .from("contabilidad_asientos")
    .update({
      estado: "anulado",
      anulado_at: new Date().toISOString(),
      anulado_by: userId,
      motivo_anulacion: String(motivo).trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

  const anulado = await getAsientoContableById(id);
  await registrarAuditoria({
    modulo: "Contabilidad",
    accion: "anular_asiento",
    entidad: "contabilidad_asiento",
    entidadId: id,
    descripcion: `Se anuló el asiento ${anulado.numero || id}.`,
    severidad: "warning",
    datosAntes: asiento,
    datosDespues: anulado,
    metadata: { motivo },
  });
  return anulado;
}

export async function duplicarAsientoManual(id) {
  const asiento = await getAsientoContableById(id);
  const fecha = dateOnly(new Date().toISOString());

  await validarPeriodoAbierto(fecha);

  return crearAsientoManual({
    fecha,
    concepto: `Copia de ${asiento.concepto}`,
    tipoAsiento: asiento.tipoAsiento === "automatico" ? "manual" : asiento.tipoAsiento,
    observaciones: asiento.observaciones,
    sedeId: asiento.sedeId,
    estado: "borrador",
    lineas: asiento.lineas.map((linea) => ({
      cuentaId: linea.cuentaId,
      descripcion: linea.descripcion,
      debe: linea.debe,
      haber: linea.haber,
    })),
  });
}

export async function anularAsientoContable(id, motivo) {
  const antes = await getAsientoContableById(id);
  const metadata = motivo
    ? {
        anulado_at: new Date().toISOString(),
        anulado_by: await getAuthUserId(),
        motivo_anulacion: motivo,
      }
    : {};

  const { data, error } = await supabase
    .from("contabilidad_asientos")
    .update({
      estado: "anulado",
      updated_at: new Date().toISOString(),
      ...metadata,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  const anulado = mapAsiento({ ...data, contabilidad_asiento_lineas: [] });
  await registrarAuditoria({
    modulo: "Contabilidad",
    accion: "anular_asiento",
    entidad: "contabilidad_asiento",
    entidadId: id,
    descripcion: `Se anuló el asiento ${anulado.numero || id}.`,
    severidad: "warning",
    datosAntes: antes,
    datosDespues: anulado,
    metadata: { motivo },
  });
  return anulado;
}

export async function asientoContableExiste(origen, origenId) {
  if (!origen || !origenId) return false;

  const { data, error } = await supabase
    .from("contabilidad_asientos")
    .select("id")
    .eq("origen", origen)
    .eq("origen_id", origenId)
    .neq("estado", "anulado")
    .maybeSingle();

  if (error) throw error;

  return Boolean(data?.id);
}

export async function crearAsientoSiNoExiste(payload) {
  if (await asientoContableExiste(payload.origen, payload.origenId)) {
    return null;
  }

  return crearAsientoContable(payload);
}

export async function getPeriodosContables() {
  const { data, error } = await supabase
    .from("contabilidad_periodos")
    .select("*")
    .order("anio", { ascending: false })
    .order("mes", { ascending: false });

  if (error) throw error;

  return (data || []).map(mapPeriodo);
}

export async function crearPeriodoContable({ anio, mes, observaciones } = {}) {
  const { year, month } = validarAnioMes(anio, mes);
  const { fechaDesde, fechaHasta } = getPeriodoFechas(year, month);

  const { data, error } = await supabase
    .from("contabilidad_periodos")
    .insert({
      anio: year,
      mes: month,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      estado: "abierto",
      observaciones: observaciones || null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("El período ya existe.");
    }

    throw error;
  }

  return mapPeriodo(data);
}

export async function crearPeriodosDelAnio(anio) {
  const year = validarAnioMes(anio, 1).year;
  const payload = Array.from({ length: 12 }, (_, index) => {
    const mes = index + 1;
    const { fechaDesde, fechaHasta } = getPeriodoFechas(year, mes);

    return {
      anio: year,
      mes,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      estado: "abierto",
    };
  });

  const { error } = await supabase
    .from("contabilidad_periodos")
    .upsert(payload, { onConflict: "anio,mes", ignoreDuplicates: true });

  if (error) throw error;

  return getPeriodosContables();
}

export async function cerrarPeriodoContable(id, observaciones) {
  const { data: antes, error: antesError } = await supabase
    .from("contabilidad_periodos")
    .select("*")
    .eq("id", id)
    .single();

  if (antesError) throw antesError;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("contabilidad_periodos")
    .update({
      estado: "cerrado",
      cerrado_por: user?.id || null,
      cerrado_at: new Date().toISOString(),
      observaciones: observaciones || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  const periodo = mapPeriodo(data);
  await registrarAuditoria({
    modulo: "Períodos Contables",
    accion: "cerrar_periodo",
    entidad: "contabilidad_periodo",
    entidadId: id,
    descripcion: `Se cerró el período ${periodo.anio || data.anio}/${periodo.mes || data.mes}.`,
    severidad: "warning",
    datosAntes: antes,
    datosDespues: periodo,
  });
  return periodo;
}

export async function reabrirPeriodoContable(id) {
  const { data: antes, error: antesError } = await supabase
    .from("contabilidad_periodos")
    .select("*")
    .eq("id", id)
    .single();

  if (antesError) throw antesError;

  const { data, error } = await supabase
    .from("contabilidad_periodos")
    .update({
      estado: "abierto",
      cerrado_por: null,
      cerrado_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  const periodo = mapPeriodo(data);
  await registrarAuditoria({
    modulo: "Períodos Contables",
    accion: "reabrir_periodo",
    entidad: "contabilidad_periodo",
    entidadId: id,
    descripcion: `Se reabrió el período ${periodo.anio || data.anio}/${periodo.mes || data.mes}.`,
    severidad: "warning",
    datosAntes: antes,
    datosDespues: periodo,
  });
  return periodo;
}

export async function getPeriodoPorFecha(fecha) {
  const cleanFecha = dateOnly(fecha);
  const { data, error } = await supabase
    .from("contabilidad_periodos")
    .select("*")
    .lte("fecha_desde", cleanFecha)
    .gte("fecha_hasta", cleanFecha)
    .maybeSingle();

  if (error) throw error;

  return data ? mapPeriodo(data) : null;
}

export async function validarPeriodoAbierto(fecha) {
  await validarEjercicioAbiertoPorFecha(fecha);

  const periodo = await getPeriodoPorFecha(fecha);

  if (!periodo) return true;

  if (periodo.estado === "cerrado") {
    throw new Error("El período contable correspondiente a esta fecha está cerrado.");
  }

  return true;
}

function validarAnioEjercicio(anio) {
  const year = Number(anio);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("El año del ejercicio no es válido.");
  }

  return year;
}

function getEjercicioFechas(anio) {
  const year = validarAnioEjercicio(anio);

  return {
    year,
    fechaDesde: `${year}-01-01`,
    fechaHasta: `${year}-12-31`,
  };
}

export async function getEjerciciosContables() {
  const { data, error } = await supabase
    .from("contabilidad_ejercicios")
    .select("*")
    .order("anio", { ascending: false });

  if (error) throw error;

  return (data || []).map(mapEjercicio);
}

export async function crearEjercicioContable({ anio, observaciones } = {}) {
  const { year, fechaDesde, fechaHasta } = getEjercicioFechas(anio);

  const { data, error } = await supabase
    .from("contabilidad_ejercicios")
    .insert({
      anio: year,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      estado: "abierto",
      observaciones: observaciones || null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("El ejercicio ya existe.");
    }

    throw error;
  }

  return mapEjercicio(data);
}

export async function getEjercicioPorAnio(anio) {
  const year = validarAnioEjercicio(anio);
  const { data, error } = await supabase
    .from("contabilidad_ejercicios")
    .select("*")
    .eq("anio", year)
    .maybeSingle();

  if (error) throw error;

  return data ? mapEjercicio(data) : null;
}

export async function validarEjercicioAbiertoPorFecha(fecha) {
  const cleanFecha = dateOnly(fecha);
  const { data, error } = await supabase
    .from("contabilidad_ejercicios")
    .select("*")
    .lte("fecha_desde", cleanFecha)
    .gte("fecha_hasta", cleanFecha)
    .maybeSingle();

  if (error) throw error;
  if (!data) return true;

  if (data.estado === "cerrado") {
    throw new Error("El ejercicio contable correspondiente a esta fecha está cerrado.");
  }

  return true;
}

export async function calcularResultadoEjercicio(anio, { sedeId } = {}) {
  const { year, fechaDesde, fechaHasta } = getEjercicioFechas(anio);
  const asientos = await getAsientosContables({
    desde: fechaDesde,
    hasta: fechaHasta,
    sedeId,
  });

  let ingresos = 0;
  let egresos = 0;

  asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .forEach((asiento) => {
      asiento.lineas.forEach((linea) => {
        if (linea.cuenta?.tipo === "INGRESO") {
          ingresos = toMoney(ingresos + linea.haber - linea.debe);
        }

        if (linea.cuenta?.tipo === "EGRESO") {
          egresos = toMoney(egresos + linea.debe - linea.haber);
        }
      });
    });

  const resultado = toMoney(ingresos - egresos);

  return {
    anio: year,
    ingresos,
    egresos,
    resultado,
    utilidad: resultado > 0,
    perdida: resultado < 0,
  };
}

export async function getBalanceAnualParaCierre(anio, { sedeId } = {}) {
  const { fechaDesde, fechaHasta } = getEjercicioFechas(anio);
  const balance = await generarBalanceSumasYSaldos({ desde: fechaDesde, hasta: fechaHasta, sedeId });
  const patrimoniales = balance.filter((cuenta) => ["ACTIVO", "PASIVO", "PATRIMONIO_NETO"].includes(cuenta.tipo));
  const resultado = balance.filter((cuenta) => ["INGRESO", "EGRESO"].includes(cuenta.tipo));
  const sumarSaldo = (items, tipo) =>
    toMoney(items.filter((item) => item.tipo === tipo).reduce((acc, item) => acc + item.saldoDeudor - item.saldoAcreedor, 0));
  const totalIngresos = toMoney(resultado.filter((item) => item.tipo === "INGRESO").reduce((acc, item) => acc + item.saldoAcreedor - item.saldoDeudor, 0));
  const totalEgresos = toMoney(resultado.filter((item) => item.tipo === "EGRESO").reduce((acc, item) => acc + item.saldoDeudor - item.saldoAcreedor, 0));

  return {
    patrimoniales,
    resultado,
    totalActivo: sumarSaldo(patrimoniales, "ACTIVO"),
    totalPasivo: Math.abs(sumarSaldo(patrimoniales, "PASIVO")),
    totalPatrimonio: Math.abs(sumarSaldo(patrimoniales, "PATRIMONIO_NETO")),
    totalIngresos,
    totalEgresos,
    resultadoEjercicio: toMoney(totalIngresos - totalEgresos),
  };
}

export async function validarEjercicioListoParaCierre(anio, { sedeId } = {}) {
  const { year, fechaDesde, fechaHasta } = getEjercicioFechas(anio);
  const errores = [];
  const warnings = [];
  const ejercicio = await getEjercicioPorAnio(year);

  if (!ejercicio) errores.push("El ejercicio contable no existe.");
  if (ejercicio?.estado === "cerrado") errores.push("El ejercicio ya está cerrado.");

  const { data: periodos, error: periodosError } = await supabase
    .from("contabilidad_periodos")
    .select("*")
    .eq("anio", year);

  if (periodosError) throw periodosError;

  if ((periodos || []).length !== 12) errores.push("Deben existir los 12 períodos mensuales del año.");
  if ((periodos || []).some((periodo) => periodo.estado !== "cerrado")) {
    errores.push("Todos los períodos mensuales del año deben estar cerrados.");
  }

  const [auditoria, desbalanceados, balance] = await Promise.all([
    getAuditoriaContable({ desde: fechaDesde, hasta: fechaHasta, sedeId }),
    getAsientosDesbalanceados({ desde: fechaDesde, hasta: fechaHasta, sedeId }),
    generarBalanceSumasYSaldos({ desde: fechaDesde, hasta: fechaHasta, sedeId }),
  ]);

  if (auditoria.resumen.totalPendientes > 0) errores.push("Hay operaciones pendientes de asiento contable.");
  if (desbalanceados.length > 0) errores.push("Hay asientos desbalanceados.");

  const totalDebe = toMoney(balance.reduce((acc, item) => acc + item.sumaDebe, 0));
  const totalHaber = toMoney(balance.reduce((acc, item) => acc + item.sumaHaber, 0));
  if (Math.abs(toMoney(totalDebe - totalHaber)) > 0.01) {
    errores.push("El balance anual tiene diferencias entre debe y haber.");
  }

  const { data: cierreActivo, error: cierreError } = await supabase
    .from("contabilidad_asientos")
    .select("id")
    .gte("fecha", fechaDesde)
    .lte("fecha", fechaHasta)
    .eq("tipo_asiento", "cierre")
    .neq("estado", "anulado")
    .limit(1)
    .maybeSingle();

  if (cierreError) throw cierreError;
  if (ejercicio?.asientoCierreId || cierreActivo?.id) errores.push("Ya existe un asiento de cierre activo para este ejercicio.");

  if (!balance.length) warnings.push("No hay movimientos contables para el ejercicio.");

  return {
    listo: errores.length === 0,
    errores,
    warnings,
  };
}

async function getCuentaResultadoEjercicio() {
  const cuentas = await resolverCuentasPorCodigo(["3.1.03"]);
  return cuentas["3.1.03"];
}

export async function generarAsientoCierreEjercicio(anio, { sedeId, observaciones } = {}) {
  const { year, fechaHasta } = getEjercicioFechas(anio);
  const validacion = await validarEjercicioListoParaCierre(year, { sedeId });

  if (!validacion.listo) {
    throw new Error(validacion.errores.join(" "));
  }

  const ejercicio = await getEjercicioPorAnio(year);
  const balance = await getBalanceAnualParaCierre(year, { sedeId });
  const cuentaResultado = await getCuentaResultadoEjercicio();
  const lineas = [];

  balance.resultado.forEach((cuenta) => {
    const saldo = toMoney(cuenta.saldoAcreedor - cuenta.saldoDeudor);

    if (cuenta.tipo === "INGRESO" && saldo > 0) {
      lineas.push({ cuentaId: cuenta.cuentaId, descripcion: "Cierre de ingresos", debe: saldo, haber: 0 });
    }

    if (cuenta.tipo === "EGRESO" && saldo < 0) {
      lineas.push({ cuentaId: cuenta.cuentaId, descripcion: "Cierre de egresos", debe: 0, haber: Math.abs(saldo) });
    }
  });

  if (balance.resultadoEjercicio > 0) {
    lineas.push({ cuentaId: cuentaResultado.id, descripcion: "Utilidad del ejercicio", debe: 0, haber: balance.resultadoEjercicio });
  } else if (balance.resultadoEjercicio < 0) {
    lineas.push({ cuentaId: cuentaResultado.id, descripcion: "Pérdida del ejercicio", debe: Math.abs(balance.resultadoEjercicio), haber: 0 });
  }

  validarLineasAsiento(lineas);

  const asiento = await crearAsientoManual({
    fecha: fechaHasta,
    concepto: `Asiento de cierre ejercicio ${year}`,
    tipoAsiento: "cierre",
    estado: "confirmado",
    sedeId,
    observaciones,
    lineas,
  });

  const userId = await getAuthUserId();
  const { data, error } = await supabase
    .from("contabilidad_ejercicios")
    .update({
      estado: "cerrado",
      resultado_ejercicio: balance.resultadoEjercicio,
      asiento_cierre_id: asiento.id,
      cerrado_por: userId,
      cerrado_at: new Date().toISOString(),
      observaciones: observaciones || ejercicio?.observaciones || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ejercicio.id)
    .select("*")
    .single();

  if (error) throw error;

  const resultado = {
    ejercicio: mapEjercicio(data),
    asiento,
    resultado: {
      anio: year,
      ingresos: balance.totalIngresos,
      egresos: balance.totalEgresos,
      resultado: balance.resultadoEjercicio,
      utilidad: balance.resultadoEjercicio > 0,
      perdida: balance.resultadoEjercicio < 0,
    },
  };
  await registrarAuditoria({
    modulo: "Cierre de Ejercicio",
    accion: "cerrar_ejercicio",
    entidad: "contabilidad_ejercicio",
    entidadId: ejercicio.id,
    descripcion: `Se cerró el ejercicio contable ${year}.`,
    severidad: "warning",
    datosAntes: ejercicio,
    datosDespues: resultado,
  });
  return resultado;
}

export async function generarAsientoAperturaNuevoEjercicio(anio, { sedeId } = {}) {
  const { year, fechaHasta } = getEjercicioFechas(anio);
  const nuevoAnio = year + 1;
  const ejercicio = await getEjercicioPorAnio(year);

  if (!ejercicio) throw new Error("El ejercicio contable no existe.");
  if (ejercicio.estado !== "cerrado") throw new Error("El ejercicio debe estar cerrado para generar la apertura.");
  if (ejercicio.asientoAperturaId) throw new Error("El ejercicio ya tiene asiento de apertura.");

  const [balance, cuentasResultado] = await Promise.all([
    generarBalanceSumasYSaldos({ desde: `${year}-01-01`, hasta: fechaHasta, sedeId }),
    resolverCuentasPorCodigo(["3.1.04"]),
  ]);
  const lineas = balance
    .filter((cuenta) => ["ACTIVO", "PASIVO", "PATRIMONIO_NETO"].includes(cuenta.tipo))
    .map((cuenta) => ({
      cuentaId: cuenta.cuentaCodigo === "3.1.03" ? cuentasResultado["3.1.04"].id : cuenta.cuentaId,
      descripcion: cuenta.cuentaCodigo === "3.1.03"
        ? "Traslado a resultado no asignado"
        : "Apertura de saldos patrimoniales",
      debe: cuenta.saldoDeudor,
      haber: cuenta.saldoAcreedor,
    }))
    .filter((linea) => toMoney(linea.debe) > 0 || toMoney(linea.haber) > 0);

  validarLineasAsiento(lineas);

  const ejercicioNuevo = (await getEjercicioPorAnio(nuevoAnio)) ||
    (await crearEjercicioContable({ anio: nuevoAnio }));
  const asiento = await crearAsientoManual({
    fecha: `${nuevoAnio}-01-01`,
    concepto: `Asiento de apertura ejercicio ${nuevoAnio}`,
    tipoAsiento: "apertura",
    estado: "confirmado",
    sedeId,
    lineas,
  });

  const { error } = await supabase
    .from("contabilidad_ejercicios")
    .update({
      asiento_apertura_id: asiento.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ejercicio.id);

  if (error) throw error;

  const resultado = {
    asiento,
    ejercicio: ejercicioNuevo,
  };
  await registrarAuditoria({
    modulo: "Cierre de Ejercicio",
    accion: "generar_apertura_ejercicio",
    entidad: "contabilidad_ejercicio",
    entidadId: ejercicio.id,
    descripcion: `Se generó la apertura del ejercicio ${nuevoAnio}.`,
    datosAntes: ejercicio,
    datosDespues: resultado,
  });
  return resultado;
}

export async function reabrirEjercicioContable(id, motivo) {
  const { data: actual, error: actualError } = await supabase
    .from("contabilidad_ejercicios")
    .select("*")
    .eq("id", id)
    .single();

  if (actualError) throw actualError;
  if (actual.estado !== "cerrado") {
    throw new Error("El ejercicio no está cerrado.");
  }

  const userId = await getAuthUserId();
  const observaciones = [
    actual.observaciones,
    motivo ? `Reapertura: ${motivo}` : "Reapertura sin motivo informado.",
  ].filter(Boolean).join("\n");

  const { data, error } = await supabase
    .from("contabilidad_ejercicios")
    .update({
      estado: "abierto",
      reabierto_por: userId,
      reabierto_at: new Date().toISOString(),
      observaciones,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  const reabierto = mapEjercicio(data);
  await registrarAuditoria({
    modulo: "Cierre de Ejercicio",
    accion: "reabrir_ejercicio",
    entidad: "contabilidad_ejercicio",
    entidadId: id,
    descripcion: `Se reabrió el ejercicio contable ${actual.anio}.`,
    severidad: "warning",
    datosAntes: actual,
    datosDespues: reabierto,
    metadata: { motivo },
  });
  return reabierto;
}

function applyDateAndSedeFilters(query, { desde, hasta, sedeId } = {}, fechaColumn = "fecha") {
  let nextQuery = query;

  if (desde) nextQuery = nextQuery.gte(fechaColumn, desde);
  if (hasta) nextQuery = nextQuery.lte(fechaColumn, hasta);
  if (sedeId && sedeId !== "todas") nextQuery = nextQuery.eq("sede_id", sedeId);

  return nextQuery;
}

async function getAsientoOrigenIds(origenes = []) {
  const { data, error } = await supabase
    .from("contabilidad_asientos")
    .select("origen, origen_id")
    .in("origen", origenes)
    .neq("estado", "anulado");

  if (error) throw error;

  return (data || []).reduce((acc, row) => {
    if (!acc[row.origen]) acc[row.origen] = new Set();
    if (row.origen_id) acc[row.origen].add(row.origen_id);
    return acc;
  }, {});
}

async function getEgresosEnOrdenPagadaIds() {
  const { data, error } = await supabase
    .from("orden_pago_items")
    .select("egreso_id, ordenes_pago!inner(estado)")
    .eq("ordenes_pago.estado", "pagada");

  if (error) throw error;

  return new Set((data || []).map((item) => item.egreso_id).filter(Boolean));
}

export async function getAsientosPendientesControl({ desde, hasta, sedeId } = {}) {
  const origenes = [
    "arca_invoice",
    "ingreso_cobro",
    "egreso",
    "egreso_pago",
    "orden_pago",
    "conciliacion_ingreso",
    "conciliacion_egreso",
    "banco_conciliacion",
  ];

  const [
    asientosPorOrigen,
    egresosEnOrdenPagada,
    facturasResult,
    ingresosResult,
    egresosResult,
    ordenesResult,
    conciliacionesIngresoResult,
    conciliacionesEgresoResult,
  ] = await Promise.all([
    getAsientoOrigenIds(origenes),
    getEgresosEnOrdenPagadaIds(),
    applyDateAndSedeFilters(
      supabase.from("arca_invoices").select("*").eq("estado", "emitida").neq("es_fiscal", false),
      { desde, hasta, sedeId },
      "created_at",
    ),
    applyDateAndSedeFilters(
      supabase.from("ingresos").select("*").eq("estado", "Cobrado"),
      { desde, hasta, sedeId },
    ),
    applyDateAndSedeFilters(
      supabase.from("egresos").select("*"),
      { desde, hasta, sedeId },
    ),
    applyDateAndSedeFilters(
      supabase.from("ordenes_pago").select("*").eq("estado", "pagada"),
      { desde, hasta, sedeId },
    ),
    applyDateAndSedeFilters(
      supabase.from("movimientos_bancarios").select("*").eq("estado", "Conciliado").not("ingreso_id", "is", null),
      { desde, hasta, sedeId },
    ),
    applyDateAndSedeFilters(
      supabase.from("movimientos_bancarios").select("*").eq("estado", "Conciliado").not("egreso_id", "is", null),
      { desde, hasta, sedeId },
    ),
  ]);

  const results = [facturasResult, ingresosResult, egresosResult, ordenesResult, conciliacionesIngresoResult, conciliacionesEgresoResult];
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;

  const hasAsiento = (origen, id) => Boolean(asientosPorOrigen[origen]?.has(id));
  const hasConciliacion = (id) =>
    hasAsiento("conciliacion_ingreso", id) ||
    hasAsiento("conciliacion_egreso", id) ||
    hasAsiento("banco_conciliacion", id);

  const facturasArcaSinAsiento = (facturasResult.data || [])
    .filter((item) => item.es_fiscal !== false)
    .filter((item) => !["remito_interno", "recibo_interno"].includes(String(item.comprobante_categoria || item.tipo_comprobante)))
    .filter((item) => !hasAsiento("arca_invoice", item.id));
  const ingresosCobradosSinAsiento = (ingresosResult.data || []).filter((item) => !hasAsiento("ingreso_cobro", item.id));
  const egresosSinAsiento = (egresosResult.data || []).filter((item) => !hasAsiento("egreso", item.id));
  const egresosPagadosSinAsiento = (egresosResult.data || [])
    .filter((item) => item.estado === "Pagado")
    .filter((item) => !egresosEnOrdenPagada.has(item.id))
    .filter((item) => !hasAsiento("egreso_pago", item.id));
  const ordenesPagoPagadasSinAsiento = (ordenesResult.data || []).filter((item) => !hasAsiento("orden_pago", item.id));
  const conciliacionesIngresoSinAsiento = (conciliacionesIngresoResult.data || []).filter((item) => !hasConciliacion(item.id));
  const conciliacionesEgresoSinAsiento = (conciliacionesEgresoResult.data || []).filter((item) => !hasConciliacion(item.id));
  const totalPendientes = [
    facturasArcaSinAsiento,
    ingresosCobradosSinAsiento,
    egresosSinAsiento,
    egresosPagadosSinAsiento,
    ordenesPagoPagadasSinAsiento,
    conciliacionesIngresoSinAsiento,
    conciliacionesEgresoSinAsiento,
  ].reduce((acc, list) => acc + list.length, 0);

  return {
    facturasArcaSinAsiento,
    ingresosCobradosSinAsiento,
    egresosSinAsiento,
    egresosPagadosSinAsiento,
    ordenesPagoPagadasSinAsiento,
    conciliacionesIngresoSinAsiento,
    conciliacionesEgresoSinAsiento,
    resumen: { totalPendientes },
  };
}

export async function getAsientosDesbalanceados({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });

  return asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .map((asiento) => {
      const totalDebe = toMoney(asiento.lineas.reduce((acc, linea) => acc + toNumber(linea.debe), 0));
      const totalHaber = toMoney(asiento.lineas.reduce((acc, linea) => acc + toNumber(linea.haber), 0));
      const diferencia = toMoney(totalDebe - totalHaber);

      return {
        asientoId: asiento.id,
        fecha: asiento.fecha,
        numero: asiento.numero,
        concepto: asiento.concepto,
        origen: asiento.origen,
        origenId: asiento.origenId,
        totalDebe,
        totalHaber,
        diferencia,
      };
    })
    .filter((item) => Math.abs(item.diferencia) > 0.01);
}

export async function getAsientosDuplicadosPorOrigen({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });
  const grupos = new Map();

  asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .filter((asiento) => asiento.origen && asiento.origenId)
    .forEach((asiento) => {
      const key = `${asiento.origen}:${asiento.origenId}`;
      if (!grupos.has(key)) {
        grupos.set(key, {
          origen: asiento.origen,
          origenId: asiento.origenId,
          asientos: [],
        });
      }

      grupos.get(key).asientos.push({
        id: asiento.id,
        fecha: asiento.fecha,
        numero: asiento.numero,
        concepto: asiento.concepto,
        estado: asiento.estado,
      });
    });

  return Array.from(grupos.values())
    .filter((grupo) => grupo.asientos.length > 1)
    .map((grupo) => ({
      ...grupo,
      cantidad: grupo.asientos.length,
    }));
}

export async function getLineasInvalidas({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });
  const invalidas = [];

  asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .forEach((asiento) => {
      asiento.lineas.forEach((linea) => {
        const motivos = [];
        const debe = toMoney(linea.debe);
        const haber = toMoney(linea.haber);

        if (!linea.cuentaId) motivos.push("Sin cuenta contable");
        if (debe < 0) motivos.push("Debe negativo");
        if (haber < 0) motivos.push("Haber negativo");
        if (debe === 0 && haber === 0) motivos.push("Debe y haber en cero");
        if (debe > 0 && haber > 0) motivos.push("Debe y haber informados al mismo tiempo");

        motivos.forEach((motivo) => {
          invalidas.push({
            lineaId: linea.id,
            asientoId: asiento.id,
            fecha: asiento.fecha,
            numero: asiento.numero,
            concepto: asiento.concepto,
            cuentaId: linea.cuentaId,
            debe,
            haber,
            motivo,
          });
        });
      });
    });

  return invalidas;
}

export async function getCuentasInactivasUsadas({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });
  const usadas = [];

  asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .forEach((asiento) => {
      asiento.lineas
        .filter((linea) => linea.cuenta && linea.cuenta.activa === false)
        .forEach((linea) => {
          usadas.push({
            asientoId: asiento.id,
            fecha: asiento.fecha,
            numero: asiento.numero,
            concepto: asiento.concepto,
            cuentaCodigo: linea.cuenta.codigo,
            cuentaNombre: linea.cuenta.nombre,
            debe: linea.debe,
            haber: linea.haber,
          });
        });
    });

  return usadas;
}

export async function getAsientosSinLineas({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });

  return asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .filter((asiento) => asiento.lineas.length === 0)
    .map((asiento) => ({
      asientoId: asiento.id,
      fecha: asiento.fecha,
      numero: asiento.numero,
      concepto: asiento.concepto,
      origen: asiento.origen,
      origenId: asiento.origenId,
    }));
}

export async function getAuditoriaContable({ desde, hasta, sedeId } = {}) {
  const params = { desde, hasta, sedeId };
  const [
    pendientesBase,
    asientosDesbalanceados,
    asientosDuplicados,
    lineasInvalidas,
    cuentasInactivasUsadas,
    asientosSinLineas,
  ] = await Promise.all([
    getAsientosPendientesControl(params),
    getAsientosDesbalanceados(params),
    getAsientosDuplicadosPorOrigen(params),
    getLineasInvalidas(params),
    getCuentasInactivasUsadas(params),
    getAsientosSinLineas(params),
  ]);

  const pendientes = {
    facturasArcaSinAsiento: pendientesBase.facturasArcaSinAsiento || [],
    ingresosCobradosSinAsiento: pendientesBase.ingresosCobradosSinAsiento || [],
    egresosSinAsiento: pendientesBase.egresosSinAsiento || [],
    egresosPagadosSinAsiento: pendientesBase.egresosPagadosSinAsiento || [],
    ordenesPagoPagadasSinAsiento: pendientesBase.ordenesPagoPagadasSinAsiento || [],
    conciliacionesIngresoSinAsiento: pendientesBase.conciliacionesIngresoSinAsiento || [],
    conciliacionesEgresoSinAsiento: pendientesBase.conciliacionesEgresoSinAsiento || [],
  };

  const inconsistencias = {
    asientosDesbalanceados,
    asientosDuplicados,
    lineasInvalidas,
    cuentasInactivasUsadas,
    asientosSinLineas,
  };

  const totalPendientes = Object.values(pendientes).reduce((acc, list) => acc + list.length, 0);
  const totalInconsistencias = Object.values(inconsistencias).reduce((acc, list) => acc + list.length, 0);

  return {
    pendientes,
    inconsistencias,
    resumen: {
      totalPendientes,
      totalInconsistencias,
      totalAlertas: totalPendientes + totalInconsistencias,
    },
  };
}

export async function resolverCuentasPorCodigo(codigos = []) {
  const codigosUnicos = [...new Set(codigos.filter(Boolean))];

  if (!codigosUnicos.length) return {};

  const { data, error } = await supabase
    .from("contabilidad_cuentas")
    .select("*")
    .in("codigo", codigosUnicos);

  if (error) throw error;

  const cuentas = {};

  (data || []).forEach((row) => {
    cuentas[row.codigo] = mapCuenta(row);
  });

  codigosUnicos.forEach((codigo) => {
    if (!cuentas[codigo]) {
      throw new Error(`No existe la cuenta contable ${codigo}.`);
    }
  });

  return cuentas;
}

export async function generarLibroDiario({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });

  return asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .flatMap((asiento) =>
      asiento.lineas.map((linea) => ({
        fecha: asiento.fecha,
        numero: asiento.numero,
        concepto: asiento.concepto,
        cuentaCodigo: linea.cuenta?.codigo || "",
        cuentaNombre: linea.cuenta?.nombre || "",
        descripcion: linea.descripcion,
        debe: linea.debe,
        haber: linea.haber,
        origen: asiento.origen,
      }))
    );
}

export async function generarLibroMayor({ desde, hasta, sedeId, cuentaId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });
  const grupos = new Map();

  asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .forEach((asiento) => {
      asiento.lineas
        .filter((linea) => !cuentaId || linea.cuentaId === cuentaId)
        .forEach((linea) => {
          const key = linea.cuentaId;

          if (!grupos.has(key)) {
            grupos.set(key, {
              cuentaId: linea.cuentaId,
              cuentaCodigo: linea.cuenta?.codigo || "",
              cuentaNombre: linea.cuenta?.nombre || "",
              movimientos: [],
              totalDebe: 0,
              totalHaber: 0,
              saldoFinal: 0,
            });
          }

          const grupo = grupos.get(key);
          grupo.totalDebe = toMoney(grupo.totalDebe + linea.debe);
          grupo.totalHaber = toMoney(grupo.totalHaber + linea.haber);
          grupo.saldoFinal = toMoney(grupo.saldoFinal + linea.debe - linea.haber);
          grupo.movimientos.push({
            fecha: asiento.fecha,
            numero: asiento.numero,
            concepto: asiento.concepto,
            descripcion: linea.descripcion,
            debe: linea.debe,
            haber: linea.haber,
            saldo: grupo.saldoFinal,
          });
        });
    });

  return Array.from(grupos.values()).sort((a, b) =>
    a.cuentaCodigo.localeCompare(b.cuentaCodigo)
  );
}

export async function generarBalanceSumasYSaldos({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });
  const grupos = new Map();

  asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .forEach((asiento) => {
      asiento.lineas.forEach((linea) => {
        const key = linea.cuentaId;

        if (!grupos.has(key)) {
          grupos.set(key, {
            cuentaId: linea.cuentaId,
            cuentaCodigo: linea.cuenta?.codigo || "",
            cuentaNombre: linea.cuenta?.nombre || "",
            tipo: linea.cuenta?.tipo || "",
            sumaDebe: 0,
            sumaHaber: 0,
            saldoDeudor: 0,
            saldoAcreedor: 0,
          });
        }

        const grupo = grupos.get(key);
        grupo.sumaDebe = toMoney(grupo.sumaDebe + linea.debe);
        grupo.sumaHaber = toMoney(grupo.sumaHaber + linea.haber);

        const saldo = toMoney(grupo.sumaDebe - grupo.sumaHaber);
        grupo.saldoDeudor = saldo > 0 ? saldo : 0;
        grupo.saldoAcreedor = saldo < 0 ? Math.abs(saldo) : 0;
      });
    });

  return Array.from(grupos.values()).sort((a, b) =>
    a.cuentaCodigo.localeCompare(b.cuentaCodigo)
  );
}

export function mapearCuentaPorDefecto(tipo) {
  return CUENTAS_POR_DEFECTO[tipo] || null;
}
