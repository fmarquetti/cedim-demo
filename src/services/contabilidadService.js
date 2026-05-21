import { supabase } from "../lib/supabaseClient";

const CUENTAS_POR_DEFECTO = {
  caja: "1.1.01",
  bancos: "1.1.02",
  clientes: "1.1.03",
  proveedores: "2.1.01",
  ivaDebito: "2.1.02",
  ivaCredito: "2.1.03",
  ventasServicios: "4.1.01",
  compras: "5.1.01",
  gastosAdministrativos: "5.1.02",
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
    lineas: (row.contabilidad_asiento_lineas || []).map(mapLinea),
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

function validarAsiento(payload) {
  if (!payload?.fecha) throw new Error("La fecha del asiento es requerida.");
  if (!payload?.concepto) throw new Error("El concepto del asiento es requerido.");
  if (!payload?.origen) throw new Error("El origen del asiento es requerido.");

  const lineas = Array.isArray(payload.lineas) ? payload.lineas : [];

  if (lineas.length < 2) {
    throw new Error("El asiento debe tener al menos 2 lineas.");
  }

  lineas.forEach(validarLinea);

  const totalDebe = toMoney(lineas.reduce((acc, item) => acc + toNumber(item.debe), 0));
  const totalHaber = toMoney(lineas.reduce((acc, item) => acc + toNumber(item.haber), 0));

  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    throw new Error(`El asiento no balancea: debe ${totalDebe} y haber ${totalHaber}.`);
  }
}

export async function getCuentasContables() {
  const { data, error } = await supabase
    .from("contabilidad_cuentas")
    .select("*")
    .order("codigo", { ascending: true });

  if (error) throw error;

  return (data || []).map(mapCuenta);
}

export async function getAsientosContables({ desde, hasta, sedeId } = {}) {
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

export async function anularAsientoContable(id) {
  const { data, error } = await supabase
    .from("contabilidad_asientos")
    .update({
      estado: "anulado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  return mapAsiento({ ...data, contabilidad_asiento_lineas: [] });
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

  return mapPeriodo(data);
}

export async function reabrirPeriodoContable(id) {
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

  return mapPeriodo(data);
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
  const periodo = await getPeriodoPorFecha(fecha);

  if (!periodo) return true;

  if (periodo.estado === "cerrado") {
    throw new Error("El período contable correspondiente a esta fecha está cerrado.");
  }

  return true;
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
