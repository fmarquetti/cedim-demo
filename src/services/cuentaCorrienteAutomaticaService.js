import { supabase } from "../lib/supabaseClient";
import {
  crearMovimientoCuentaCorriente,
  formatVoucher,
  getOrCreateEntidadDesdeCliente,
  getOrCreateEntidadDesdeProveedor,
  normalizeText,
} from "./cuentaCorrienteEntidadService";

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().split("T")[0];
  return String(value).includes("T") ? String(value).split("T")[0] : String(value);
}

function getImporteTotal(item) {
  return round2(item?.importe_total || item?.importeTotal || item?.importe || item?.total);
}

function isInternalInvoice(invoice) {
  return (
    invoice?.es_fiscal === false ||
    ["remito_interno", "recibo_interno"].includes(
      String(invoice?.comprobante_categoria || invoice?.tipo_comprobante || "")
    )
  );
}

function isNotaCredito(tipoComprobante) {
  return [3, 8, 13].includes(Number(tipoComprobante));
}

function isNotaDebito(tipoComprobante) {
  return [2, 7, 12].includes(Number(tipoComprobante));
}

function facturaTipoMovimiento(invoice) {
  if (isNotaCredito(invoice?.tipo_comprobante)) return "nota_credito";
  if (isNotaDebito(invoice?.tipo_comprobante)) return "nota_debito";
  return "factura";
}

export async function generarCcDesdeFacturaArca(invoice) {
  if (!invoice?.id || isInternalInvoice(invoice)) return { skipped: true };

  const entidad = await getOrCreateEntidadDesdeCliente(invoice);
  if (!entidad?.id) return { skipped: true };

  const total = getImporteTotal(invoice);
  if (total <= 0) return { skipped: true };

  const tipoMovimiento = facturaTipoMovimiento(invoice);
  const esCredito = tipoMovimiento === "nota_credito";
  const comprobante = formatVoucher(invoice.punto_venta, invoice.numero_comprobante);
  const tipoLabel =
    tipoMovimiento === "nota_credito"
      ? "Nota de credito"
      : tipoMovimiento === "nota_debito"
        ? "Nota de debito"
        : "Factura";

  return crearMovimientoCuentaCorriente({
    entidadId: entidad.id,
    fecha: dateOnly(invoice.fecha || invoice.created_at),
    tipoEntidad: "cliente",
    tipoMovimiento,
    origen: "arca_invoice",
    origenId: invoice.id,
    descripcion: `${tipoLabel} ARCA ${entidad.nombre}`.trim(),
    comprobante,
    debe: esCredito ? 0 : total,
    haber: esCredito ? total : 0,
    sedeId: invoice.sede_id || invoice.sedeId,
    metadata: {
      cae: invoice.cae,
      tipo_comprobante: invoice.tipo_comprobante,
      punto_venta: invoice.punto_venta,
      numero_comprobante: invoice.numero_comprobante,
    },
  });
}

export async function generarCcDesdeIngresoCobrado(ingreso) {
  if (!ingreso?.id) return { skipped: true };

  const entidad = await getOrCreateEntidadDesdeCliente(ingreso);
  if (!entidad?.id) return { skipped: true };

  const total = getImporteTotal(ingreso);
  if (total <= 0) return { skipped: true };

  return crearMovimientoCuentaCorriente({
    entidadId: entidad.id,
    fecha: dateOnly(ingreso.fechaDb || ingreso.fecha || ingreso.created_at),
    tipoEntidad: "cliente",
    tipoMovimiento: "cobro",
    origen: "ingreso",
    origenId: ingreso.id,
    descripcion: `Cobro ingreso ${ingreso.concepto || entidad.nombre}`.trim(),
    comprobante: ingreso.comprobante || "",
    debe: 0,
    haber: total,
    estado: "aplicado",
    sedeId: ingreso.sedeId || ingreso.sede_id,
    metadata: {
      cobro: ingreso.cobro,
      origen_ingreso: ingreso.origen,
      sociedad: ingreso.sociedad,
      fecha_vencimiento:
        ingreso.fechaVencimiento || ingreso.fecha_vencimiento || ingreso.vencimiento || null,
    },
  });
}

export async function generarCcDesdeEgreso(egreso) {
  if (!egreso?.id) return { skipped: true };

  const entidad = await getOrCreateEntidadDesdeProveedor(egreso);
  if (!entidad?.id) return { skipped: true };

  const total = getImporteTotal(egreso);
  if (total <= 0) return { skipped: true };

  const tieneFactura =
    egreso.factura_clave ||
    egreso.factura_numero ||
    egreso.datosFiscales?.nroCmp ||
    egreso.comprobante;

  return crearMovimientoCuentaCorriente({
    entidadId: entidad.id,
    fecha: dateOnly(egreso.fechaDb || egreso.fecha || egreso.created_at),
    tipoEntidad: "proveedor",
    tipoMovimiento: tieneFactura ? "factura" : "ajuste",
    origen: "egreso",
    origenId: egreso.id,
    descripcion: `${tieneFactura ? "Factura proveedor" : "Egreso"} ${entidad.nombre}`.trim(),
    comprobante: egreso.comprobante || egreso.factura_numero || "",
    debe: total,
    haber: 0,
    sedeId: egreso.sedeId || egreso.sede_id,
    metadata: {
      concepto: egreso.concepto,
      categoria: egreso.categoria,
      sociedad: egreso.sociedad,
      fecha_vencimiento:
        egreso.fechaVencimiento ||
        egreso.fecha_vencimiento ||
        egreso.vencimiento ||
        null,
    },
  });
}

export async function generarCcDesdeOrdenPago(orden) {
  if (!orden?.id) return { skipped: true };

  const entidad = await getOrCreateEntidadDesdeProveedor(orden);
  if (!entidad?.id) return { skipped: true };

  const total = getImporteTotal(orden);
  if (total <= 0) return { skipped: true };

  return crearMovimientoCuentaCorriente({
    entidadId: entidad.id,
    fecha: dateOnly(orden.paidAt || orden.paid_at || orden.fecha),
    tipoEntidad: "proveedor",
    tipoMovimiento: "pago",
    origen: "orden_pago",
    origenId: orden.id,
    descripcion: `Pago ${orden.numeroFormateado || orden.numero || orden.id}`.trim(),
    comprobante: orden.numeroFormateado || `OP-${String(orden.numero || 0).padStart(8, "0")}`,
    debe: 0,
    haber: total,
    estado: "aplicado",
    sedeId: orden.sedeId || orden.sede_id,
    metadata: {
      proveedor: orden.proveedor,
      medio_pago: orden.medioPago || orden.medio_pago,
      cuenta_pago: orden.cuentaPago || orden.cuenta_pago,
    },
  });
}

export async function regenerarCuentaCorrienteOperacion(tipo, id) {
  if (!tipo || !id) throw new Error("Tipo e id son requeridos.");

  if (tipo === "arca_invoice") {
    const { data, error } = await supabase.from("arca_invoices").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return generarCcDesdeFacturaArca(data);
  }

  if (tipo === "ingreso_cobro") {
    const { data, error } = await supabase.from("ingresos").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (normalizeText(data?.estado) !== "cobrado") return { skipped: true };
    return generarCcDesdeIngresoCobrado(data);
  }

  if (tipo === "egreso") {
    const { data, error } = await supabase.from("egresos").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return generarCcDesdeEgreso(data);
  }

  if (tipo === "orden_pago") {
    const { data, error } = await supabase.from("ordenes_pago").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (normalizeText(data?.estado) !== "pagada") return { skipped: true };
    return generarCcDesdeOrdenPago(data);
  }

  throw new Error("Tipo de operacion no soportado.");
}

