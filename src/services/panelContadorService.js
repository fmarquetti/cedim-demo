import { supabase } from "../lib/supabaseClient";
import { getResumenIva } from "./ivaService";
import {
  getAuditoriaContable,
  getAsientosContables,
  getPeriodosContables,
} from "./contabilidadService";
import { getOrdenesPago } from "./ordenPagoService";
import { getResumenCuentasCorrientes } from "./cuentaCorrienteEntidadService";
import { getIngresos } from "./ingresoService";
import { getEgresos } from "./egresoService";
import { getMovimientosBancarios } from "./bancoService";
import { getDbSedeId } from "../utils/sedeUtils";

function toNumber(value) {
  return Number(value || 0);
}

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getMonthRange(anio, mes) {
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const hastaDate = new Date(anio, mes, 0);
  const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(hastaDate.getDate()).padStart(2, "0")}`;
  return { desde, hasta };
}

function normalizeEstado(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDate(value) {
  if (!value) return "";
  return String(value).includes("T") ? String(value).split("T")[0] : String(value);
}

function isInRange(value, desde, hasta) {
  const fecha = normalizeDate(value);
  if (!fecha) return false;
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

function getSedeId(sedeId) {
  return getDbSedeId(sedeId);
}

function countByEstado(items, estado) {
  return items.filter((item) => normalizeEstado(item.estado) === estado).length;
}

function sumBy(items, getter) {
  return round2(items.reduce((acc, item) => acc + toNumber(getter(item)), 0));
}

function buildChecklist({ periodo, contabilidad, operaciones, ordenesPago, iva, listoBase }) {
  const periodoExiste = Boolean(periodo.periodoId);
  const periodoAbierto = normalizeEstado(periodo.estado) === "abierto";
  const pendientesOp = ordenesPago.borrador + ordenesPago.aprobada;
  const tieneIva = toNumber(iva.totalVentas) !== 0 || toNumber(iva.totalCompras) !== 0;

  const checklist = [
    {
      key: "periodo_creado",
      label: "Periodo contable creado",
      status: periodoExiste ? "OK" : "WARNING",
      severity: periodoExiste ? "OK" : "WARNING",
      detail: periodoExiste ? `Periodo ${periodo.mes}/${periodo.anio} registrado.` : "No existe periodo contable para el mes.",
    },
    {
      key: "estado_periodo",
      label: "Estado del periodo",
      status: periodoAbierto ? "OK" : "INFO",
      severity: periodoAbierto ? "OK" : "INFO",
      detail: periodoExiste ? `Estado actual: ${periodo.estado}.` : "Sin periodo creado.",
    },
    {
      key: "operaciones_sin_asiento",
      label: "Sin operaciones pendientes de asiento",
      status: contabilidad.operacionesSinAsiento === 0 ? "OK" : "ERROR",
      severity: contabilidad.operacionesSinAsiento === 0 ? "OK" : "ERROR",
      detail: `${contabilidad.operacionesSinAsiento} operaciones pendientes.`,
    },
    {
      key: "asientos_desbalanceados",
      label: "Sin asientos desbalanceados",
      status: contabilidad.asientosDesbalanceados === 0 ? "OK" : "ERROR",
      severity: contabilidad.asientosDesbalanceados === 0 ? "OK" : "ERROR",
      detail: `${contabilidad.asientosDesbalanceados} asientos con diferencia.`,
    },
    {
      key: "balance_equilibrado",
      label: "Balance contable equilibrado",
      status: Math.abs(contabilidad.diferencia) <= 0.01 ? "OK" : "ERROR",
      severity: Math.abs(contabilidad.diferencia) <= 0.01 ? "OK" : "ERROR",
      detail: `Diferencia debe/haber: ${round2(contabilidad.diferencia)}.`,
    },
    {
      key: "bancos_pendientes",
      label: "Sin movimientos bancarios pendientes",
      status: operaciones.movimientosBancariosPendientes === 0 ? "OK" : "WARNING",
      severity: operaciones.movimientosBancariosPendientes === 0 ? "OK" : "WARNING",
      detail: `${operaciones.movimientosBancariosPendientes} movimientos pendientes.`,
    },
    {
      key: "ordenes_pendientes",
      label: "Ordenes de pago pendientes revisadas",
      status: pendientesOp === 0 ? "OK" : "WARNING",
      severity: pendientesOp === 0 ? "OK" : "WARNING",
      detail: `${pendientesOp} ordenes en borrador o aprobadas.`,
    },
    {
      key: "iva_calculado",
      label: "IVA calculado",
      status: tieneIva ? "OK" : "WARNING",
      severity: tieneIva ? "OK" : "WARNING",
      detail: tieneIva ? "Hay datos de IVA para el periodo." : "No hay ventas ni compras con IVA en el periodo.",
    },
    {
      key: "cuentas_corrientes",
      label: "Cuentas corrientes revisadas",
      status: "OK",
      severity: "OK",
      detail: "Saldos incluidos en el resumen del panel.",
    },
  ];

  return {
    checklist,
    listoParaCerrar: Boolean(listoBase && !checklist.some((item) => item.severity === "ERROR")),
  };
}

async function getFacturasArca({ desde, hasta, sedeId }) {
  let query = supabase
    .from("arca_invoices")
    .select("*")
    .eq("estado", "emitida")
    .neq("es_fiscal", false)
    .order("created_at", { ascending: false });

  if (desde) query = query.gte("created_at", desde);
  if (hasta) query = query.lte("created_at", `${hasta}T23:59:59`);
  const sede = getSedeId(sedeId);
  if (sede) query = query.eq("sede_id", sede);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter((item) => {
    const categoria = normalizeEstado(item.comprobante_categoria || item.tipo_comprobante);
    return !["remito_interno", "recibo_interno"].includes(categoria);
  });
}

export async function getPanelContador({ anio, mes, sedeId } = {}) {
  const now = new Date();
  const year = Number(anio || now.getFullYear());
  const month = Number(mes || now.getMonth() + 1);
  const { desde, hasta } = getMonthRange(year, month);
  const sede = getSedeId(sedeId);

  const [
    periodos,
    resumenIva,
    auditoria,
    asientosRaw,
    ingresosRaw,
    egresosRaw,
    movimientosRaw,
    ordenesRaw,
    clientesCc,
    proveedoresCc,
    facturasArca,
  ] = await Promise.all([
    getPeriodosContables(),
    getResumenIva({ desde, hasta, sedeId: sede }),
    getAuditoriaContable({ desde, hasta, sedeId: sede }),
    getAsientosContables({ desde, hasta, sedeId: sede }),
    getIngresos(sede),
    getEgresos(sede),
    getMovimientosBancarios(sede),
    getOrdenesPago({ desde, hasta, sedeId: sede }),
    getResumenCuentasCorrientes({ tipoEntidad: "cliente", sedeId: sede }),
    getResumenCuentasCorrientes({ tipoEntidad: "proveedor", sedeId: sede }),
    getFacturasArca({ desde, hasta, sedeId: sede }),
  ]);

  const periodoEncontrado = (periodos || []).find((item) => Number(item.anio) === year && Number(item.mes) === month);
  const asientos = (asientosRaw || []).filter((item) => normalizeEstado(item.estado) !== "anulado");
  const totalDebe = sumBy(asientos.flatMap((item) => item.lineas || []), (linea) => linea.debe);
  const totalHaber = sumBy(asientos.flatMap((item) => item.lineas || []), (linea) => linea.haber);
  const ingresos = (ingresosRaw || []).filter((item) => isInRange(item.fechaDb || item.fecha, desde, hasta));
  const egresos = (egresosRaw || []).filter((item) => isInRange(item.fechaDb || item.fecha, desde, hasta));
  const movimientos = (movimientosRaw || []).filter((item) => isInRange(item.fechaDb || item.fecha, desde, hasta));
  const asientosDesbalanceados = auditoria?.inconsistencias?.asientosDesbalanceados?.length || 0;
  const operacionesSinAsiento = auditoria?.resumen?.totalPendientes || 0;
  const totalInconsistencias = auditoria?.resumen?.totalInconsistencias || 0;

  const iva = {
    ivaDebito: round2(resumenIva?.ivaDebito),
    ivaCredito: round2(resumenIva?.ivaCredito),
    saldoIva: round2(resumenIva?.saldoIva),
    totalVentas: round2(resumenIva?.resumenVentas?.total),
    totalCompras: round2(resumenIva?.resumenCompras?.total),
  };

  const contabilidad = {
    cantidadAsientos: asientos.length,
    totalDebe,
    totalHaber,
    diferencia: round2(totalDebe - totalHaber),
    asientosDesbalanceados,
    operacionesSinAsiento,
    alertas: totalInconsistencias,
  };

  const operaciones = {
    ingresosTotal: sumBy(ingresos, (item) => item.importe),
    ingresosPendientes: sumBy(ingresos.filter((item) => normalizeEstado(item.estado) !== "cobrado"), (item) => item.importe),
    egresosTotal: sumBy(egresos, (item) => item.importe),
    egresosPendientes: sumBy(egresos.filter((item) => normalizeEstado(item.estado) !== "pagado"), (item) => item.importe),
    facturasArcaCantidad: facturasArca.length,
    facturasArcaTotal: sumBy(facturasArca, (item) => {
      const signo = [3, 8, 13].includes(Number(item.tipo_comprobante)) ? -1 : 1;
      return signo * toNumber(item.importe_total);
    }),
    movimientosBancariosCantidad: movimientos.length,
    movimientosBancariosPendientes: movimientos.filter((item) => normalizeEstado(item.estado) === "pendiente").length,
  };

  const ordenesPago = {
    total: ordenesRaw.length,
    borrador: countByEstado(ordenesRaw, "borrador"),
    aprobada: countByEstado(ordenesRaw, "aprobada"),
    pagada: countByEstado(ordenesRaw, "pagada"),
    anulada: countByEstado(ordenesRaw, "anulada"),
    importePendiente: sumBy(
      ordenesRaw.filter((item) => ["borrador", "aprobada"].includes(normalizeEstado(item.estado))),
      (item) => item.importeTotal
    ),
    importePagado: sumBy(
      ordenesRaw.filter((item) => normalizeEstado(item.estado) === "pagada"),
      (item) => item.importeTotal
    ),
  };

  const clientesConSaldo = (clientesCc || []).filter((item) => Math.abs(toNumber(item.saldo)) > 0.01);
  const proveedoresConSaldo = (proveedoresCc || []).filter((item) => Math.abs(toNumber(item.saldo)) > 0.01);
  const cuentasCorrientes = {
    clientesConSaldo: clientesConSaldo.length,
    proveedoresConSaldo: proveedoresConSaldo.length,
    saldoClientes: sumBy(clientesConSaldo, (item) => item.saldo),
    saldoProveedores: sumBy(proveedoresConSaldo, (item) => item.saldo),
  };

  const periodo = {
    anio: year,
    mes: month,
    desde,
    hasta,
    estado: periodoEncontrado?.estado || "sin_periodo",
    periodoId: periodoEncontrado?.id || null,
    cerradoAt: periodoEncontrado?.cerradoAt || null,
  };

  const listoBase =
    Boolean(periodo.periodoId) &&
    normalizeEstado(periodo.estado) === "abierto" &&
    contabilidad.operacionesSinAsiento === 0 &&
    contabilidad.asientosDesbalanceados === 0 &&
    Math.abs(contabilidad.diferencia) <= 0.01;

  const { checklist, listoParaCerrar } = buildChecklist({
    periodo,
    contabilidad,
    operaciones,
    ordenesPago,
    iva,
    listoBase,
  });

  return {
    periodo,
    iva,
    contabilidad,
    operaciones,
    ordenesPago,
    cuentasCorrientes,
    checklist: checklist.map((item) =>
      item.key === "cuentas_corrientes"
        ? {
            ...item,
            detail: `${cuentasCorrientes.clientesConSaldo} clientes y ${cuentasCorrientes.proveedoresConSaldo} proveedores con saldo.`,
          }
        : item
    ),
    listoParaCerrar,
  };
}
