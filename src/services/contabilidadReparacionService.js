import { supabase } from "../lib/supabaseClient";
import {
  registrarAsientoConciliacionEgreso,
  registrarAsientoConciliacionIngreso,
  registrarAsientoEgresoCargado,
  registrarAsientoEgresoPagado,
  registrarAsientoFacturaArca,
  registrarAsientoIngresoCobrado,
} from "./contabilidadAutomationService";
import {
  asientoContableExiste,
  crearAsientoSiNoExiste,
  getAsientosPendientesControl,
  resolverCuentasPorCodigo,
} from "./contabilidadService";

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().split("T")[0];
  return String(value).includes("T") ? String(value).split("T")[0] : String(value);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isEstado(value, expected) {
  return normalizeText(value) === normalizeText(expected);
}

function getCuentaPagoCodigo(medioPago = "", cuentaPago = "") {
  const value = normalizeText(`${medioPago} ${cuentaPago}`);
  const esBanco = ["transferencia", "banco", "debito", "credito", "cheque", "mercado pago"].some(
    (token) => value.includes(token)
  );

  return esBanco ? "1.1.02" : "1.1.01";
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || null;
}

function mapOrdenPago(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    numero: row.numero,
    proveedor: row.proveedor,
    sedeId: row.sede_id,
    medioPago: row.medio_pago,
    cuentaPago: row.cuenta_pago,
    importeTotal: round2(row.importe_total),
    estado: row.estado,
    paidAt: row.paid_at,
    items: row.orden_pago_items || [],
  };
}

function mapOperacion(row) {
  if (!row) return row;

  return {
    ...row,
    fechaDb: row.fecha,
    sedeId: row.sede_id,
    datosFiscales: row.datos_fiscales || row.datosFiscales,
  };
}

function mapMovimiento(row) {
  if (!row) return row;

  return {
    ...row,
    fechaDb: row.fecha,
    sedeId: row.sede_id,
  };
}

async function getSingle(table, id, select = "*") {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function normalizarResultado(result) {
  if (!result) {
    return { status: "skipped", skipped: true };
  }

  return { status: "repaired", asiento: result };
}

export async function regenerarAsientoFacturaArca(invoiceId) {
  const invoice = await getSingle("arca_invoices", invoiceId);
  if (!invoice) throw new Error("La factura ARCA no existe.");

  return normalizarResultado(await registrarAsientoFacturaArca(invoice));
}

export async function regenerarAsientoIngresoCobrado(ingresoId) {
  const ingreso = mapOperacion(await getSingle("ingresos", ingresoId));
  if (!ingreso) throw new Error("El ingreso no existe.");
  if (!isEstado(ingreso.estado, "Cobrado")) throw new Error("El ingreso no esta cobrado.");

  return normalizarResultado(await registrarAsientoIngresoCobrado(ingreso));
}

export async function regenerarAsientoEgreso(egresoId) {
  const egreso = mapOperacion(await getSingle("egresos", egresoId));
  if (!egreso) throw new Error("El egreso no existe.");

  return normalizarResultado(await registrarAsientoEgresoCargado(egreso));
}

export async function regenerarAsientoEgresoPagado(egresoId) {
  const egreso = mapOperacion(await getSingle("egresos", egresoId));
  if (!egreso) throw new Error("El egreso no existe.");
  if (!isEstado(egreso.estado, "Pagado")) throw new Error("El egreso no esta pagado.");

  return normalizarResultado(await registrarAsientoEgresoPagado(egreso));
}

export async function regenerarAsientoConciliacionIngreso(movimientoId) {
  const movimiento = mapMovimiento(await getSingle("movimientos_bancarios", movimientoId));
  if (!movimiento) throw new Error("El movimiento bancario no existe.");
  if (!isEstado(movimiento.estado, "Conciliado")) throw new Error("El movimiento no esta conciliado.");
  if (!movimiento.ingreso_id) throw new Error("El movimiento no tiene ingreso asociado.");

  const ingreso = mapOperacion(await getSingle("ingresos", movimiento.ingreso_id));
  if (!ingreso) throw new Error("El ingreso asociado no existe.");

  return normalizarResultado(await registrarAsientoConciliacionIngreso(movimiento, ingreso));
}

export async function regenerarAsientoConciliacionEgreso(movimientoId) {
  const movimiento = mapMovimiento(await getSingle("movimientos_bancarios", movimientoId));
  if (!movimiento) throw new Error("El movimiento bancario no existe.");
  if (!isEstado(movimiento.estado, "Conciliado")) throw new Error("El movimiento no esta conciliado.");
  if (!movimiento.egreso_id) throw new Error("El movimiento no tiene egreso asociado.");

  const egreso = mapOperacion(await getSingle("egresos", movimiento.egreso_id));
  if (!egreso) throw new Error("El egreso asociado no existe.");

  return normalizarResultado(await registrarAsientoConciliacionEgreso(movimiento, egreso));
}

export async function regenerarAsientoOrdenPago(ordenPagoId) {
  if (await asientoContableExiste("orden_pago", ordenPagoId)) {
    return { status: "skipped", skipped: true };
  }

  const row = await getSingle(
    "ordenes_pago",
    ordenPagoId,
    `
      *,
      orden_pago_items (
        *,
        egresos (*)
      )
    `,
  );

  if (!row) throw new Error("La orden de pago no existe.");

  const orden = mapOrdenPago(row);
  if (!isEstado(orden.estado, "pagada")) throw new Error("La orden de pago no esta pagada.");
  if (!orden.items.length) throw new Error("La orden de pago no tiene items.");

  const cuentaPagoCodigo = getCuentaPagoCodigo(orden.medioPago, orden.cuentaPago);
  const cuentas = await resolverCuentasPorCodigo(["2.1.01", cuentaPagoCodigo]);
  const importe = round2(orden.importeTotal);

  if (importe <= 0) throw new Error("La orden de pago no tiene importe valido.");

  const asiento = await crearAsientoSiNoExiste({
    fecha: dateOnly(orden.paidAt || orden.fecha),
    concepto: `Orden de pago OP-${String(orden.numero || 0).padStart(8, "0")} - ${orden.proveedor || "Proveedor"}`,
    origen: "orden_pago",
    origenId: orden.id,
    sedeId: orden.sedeId,
    estado: "confirmado",
    createdBy: await getCurrentUserId(),
    lineas: [
      {
        cuentaId: cuentas["2.1.01"].id,
        descripcion: orden.proveedor || "Proveedor",
        debe: importe,
        haber: 0,
      },
      {
        cuentaId: cuentas[cuentaPagoCodigo].id,
        descripcion: orden.cuentaPago || orden.medioPago || "Pago",
        debe: 0,
        haber: importe,
      },
    ],
  });

  return normalizarResultado(asiento);
}

export async function regenerarPendiente(tipo, id) {
  const handlers = {
    arca_invoice: regenerarAsientoFacturaArca,
    ingreso_cobro: regenerarAsientoIngresoCobrado,
    egreso: regenerarAsientoEgreso,
    egreso_pago: regenerarAsientoEgresoPagado,
    orden_pago: regenerarAsientoOrdenPago,
    conciliacion_ingreso: regenerarAsientoConciliacionIngreso,
    conciliacion_egreso: regenerarAsientoConciliacionEgreso,
  };

  const handler = handlers[tipo];
  if (!handler) throw new Error(`Tipo de pendiente no soportado: ${tipo}.`);

  return handler(id);
}

export async function regenerarTodosLosPendientes({ desde, hasta, sedeId } = {}) {
  const pendientes = await getAsientosPendientesControl({ desde, hasta, sedeId });
  const tareas = [
    ["arca_invoice", pendientes.facturasArcaSinAsiento],
    ["ingreso_cobro", pendientes.ingresosCobradosSinAsiento],
    ["egreso", pendientes.egresosSinAsiento],
    ["egreso_pago", pendientes.egresosPagadosSinAsiento],
    ["orden_pago", pendientes.ordenesPagoPagadasSinAsiento],
    ["conciliacion_ingreso", pendientes.conciliacionesIngresoSinAsiento],
    ["conciliacion_egreso", pendientes.conciliacionesEgresoSinAsiento],
  ].flatMap(([tipo, rows]) => (rows || []).map((row) => ({ tipo, id: row.id })));

  const resumen = {
    procesados: 0,
    reparados: 0,
    omitidos: 0,
    errores: [],
  };

  for (const tarea of tareas) {
    resumen.procesados += 1;

    try {
      const result = await regenerarPendiente(tarea.tipo, tarea.id);
      if (result?.skipped || result?.status === "skipped") {
        resumen.omitidos += 1;
      } else {
        resumen.reparados += 1;
      }
    } catch (error) {
      resumen.errores.push({
        tipo: tarea.tipo,
        id: tarea.id,
        mensaje: error.message || "No se pudo regenerar el asiento.",
      });
    }
  }

  return resumen;
}
