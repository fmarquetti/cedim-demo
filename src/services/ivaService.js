import { supabase } from "../lib/supabaseClient";
import { calcularTotalesFiscales } from "./fiscalService";

function toNumber(value) {
  return Number(value || 0);
}

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeDate(value) {
  if (!value) return "";
  return String(value).includes("T") ? String(value).split("T")[0] : String(value);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isNotaCredito(tipoComprobante) {
  return [3, 8, 13].includes(Number(tipoComprobante));
}

function isNotaDebito(tipoComprobante) {
  return [2, 7, 12].includes(Number(tipoComprobante));
}

function isTipoC(tipoComprobante) {
  return [11, 12, 13].includes(Number(tipoComprobante));
}

function isInternalVoucher(tipoComprobante, categoria) {
  return ["remito_interno", "recibo_interno"].includes(normalizeText(tipoComprobante || categoria));
}

function formatVoucher(puntoVenta, numero) {
  if (!puntoVenta || !numero) return "-";
  return `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

function getTipoComprobanteLabel(tipoComprobante, categoria = "") {
  if (isInternalVoucher(tipoComprobante, categoria)) return "Comprobante interno";

  const labels = {
    1: "Factura A",
    2: "Nota de Débito A",
    3: "Nota de Crédito A",
    6: "Factura B",
    7: "Nota de Débito B",
    8: "Nota de Crédito B",
    11: "Factura C",
    12: "Nota de Débito C",
    13: "Nota de Crédito C",
  };

  return labels[Number(tipoComprobante)] || `Tipo ${tipoComprobante || "-"}`;
}

const TIPOS_FISCALES_IVA = [1, 2, 3, 6, 7, 8, 11, 12, 13];

function isInDateRange(fecha, desde, hasta) {
  const clean = normalizeDate(fecha);
  if (desde && clean < desde) return false;
  if (hasta && clean > hasta) return false;
  return true;
}

function matchesSede(row, sedeId) {
  if (!sedeId || sedeId === "todas") return true;
  if (!Object.prototype.hasOwnProperty.call(row, "sede_id")) return true;
  return String(row.sede_id || "") === String(sedeId);
}

function pickFiscalValue(source, keys, fallback = 0) {
  const foundKey = keys.find((key) => source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== "");
  return foundKey ? source[foundKey] : fallback;
}

function sortByDateDesc(a, b) {
  return String(b.fecha || "").localeCompare(String(a.fecha || ""));
}

export async function getLibroIvaVentas({ desde, hasta, sedeId } = {}) {
  const { data, error } = await supabase
    .from("arca_invoices")
    .select("*")
    .order("emitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rowsBase = data || [];
  const ids = rowsBase.map((row) => row.id).filter(Boolean);
  const [conceptosResult, tributosResult] = ids.length
    ? await Promise.all([
        supabase.from("comprobante_conceptos_fiscales").select("*").eq("origen", "arca_invoice").in("origen_id", ids),
        supabase.from("comprobante_tributos").select("*").eq("origen", "arca_invoice").in("origen_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  if (conceptosResult.error) throw conceptosResult.error;
  if (tributosResult.error) throw tributosResult.error;
  const conceptosPorOrigen = (conceptosResult.data || []).reduce((acc, item) => {
    if (!acc[item.origen_id]) acc[item.origen_id] = [];
    acc[item.origen_id].push(item);
    return acc;
  }, {});
  const tributosPorOrigen = (tributosResult.data || []).reduce((acc, item) => {
    if (!acc[item.origen_id]) acc[item.origen_id] = [];
    acc[item.origen_id].push(item);
    return acc;
  }, {});

  return rowsBase
    .filter((row) => row.es_fiscal !== false)
    .filter((row) => !isInternalVoucher(row.tipo_comprobante, row.comprobante_categoria))
    .filter((row) => matchesSede(row, sedeId))
    .filter((row) => {
      const tipo = Number(row.tipo_comprobante);
      return (
        TIPOS_FISCALES_IVA.includes(tipo) ||
        isNotaCredito(tipo) ||
        isNotaDebito(tipo)
      );
    })
    .map((row) => {
      const fecha = normalizeDate(row.emitted_at || row.created_at);
      const signo = isNotaCredito(row.tipo_comprobante) ? -1 : 1;
      const totalBase = toNumber(row.importe_total);
      const ivaBase = toNumber(row.importe_iva);
      const netoBase = row.importe_neto === undefined || row.importe_neto === null
        ? totalBase - ivaBase
        : toNumber(row.importe_neto);

      const isC = isTipoC(row.tipo_comprobante);
      const conceptos = conceptosPorOrigen[row.id] || [];
      const tributos = tributosPorOrigen[row.id] || [];
      const totales = calcularTotalesFiscales({ conceptos, tributos });
      const total = round2(totalBase * signo);
      const iva = conceptos.length ? round2(totales.iva * signo) : isC ? 0 : round2(ivaBase * signo);
      const netoGravado = conceptos.length ? round2(totales.netoGravado * signo) : isC ? 0 : round2(netoBase * signo);
      const exento = conceptos.length ? round2(totales.exento * signo) : 0;
      const noGravado = conceptos.length ? round2(totales.noGravado * signo) : isC ? total : 0;

      return {
        id: row.id,
        fecha,
        tipoComprobante: row.tipo_comprobante,
        tipoComprobanteLabel: getTipoComprobanteLabel(row.tipo_comprobante, row.comprobante_categoria),
        puntoVenta: row.punto_venta,
        numeroComprobante: row.numero_comprobante,
        comprobante: formatVoucher(row.punto_venta, row.numero_comprobante),
        clienteNombre: row.cliente_nombre || "-",
        clienteDocumento: row.cliente_documento || "-",
        clienteIva: row.cliente_iva || "-",
        netoGravado,
        iva,
        exento,
        noGravado,
        total,
        retenciones: round2(totales.retenciones * signo),
        percepciones: round2(totales.percepciones * signo),
        otrosTributos: round2(totales.otrosTributos * signo),
        totalFiscal: conceptos.length || tributos.length ? round2(totales.totalFinal * signo) : total,
        cae: row.cae || "-",
        estado: row.estado || "-",
        signo,
      };
    })
    .filter((row) => isInDateRange(row.fecha, desde, hasta))
    .sort(sortByDateDesc);
}

export function calcularResumenIvaVentas(rows) {
  return (rows || []).reduce(
    (acc, row) => ({
      netoGravado: round2(acc.netoGravado + toNumber(row.netoGravado)),
      ivaDebito: round2(acc.ivaDebito + toNumber(row.iva)),
      exento: round2(acc.exento + toNumber(row.exento)),
      noGravado: round2(acc.noGravado + toNumber(row.noGravado)),
      retenciones: round2(acc.retenciones + toNumber(row.retenciones)),
      percepciones: round2(acc.percepciones + toNumber(row.percepciones)),
      otrosTributos: round2(acc.otrosTributos + toNumber(row.otrosTributos)),
      total: round2(acc.total + toNumber(row.total)),
    }),
    {
      netoGravado: 0,
      ivaDebito: 0,
      exento: 0,
      noGravado: 0,
      retenciones: 0,
      percepciones: 0,
      otrosTributos: 0,
      total: 0,
    }
  );
}

export async function getLibroIvaCompras({ desde, hasta, sedeId } = {}) {
  let query = supabase
    .from("egresos")
    .select("*")
    .order("fecha", { ascending: false });

  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);
  if (sedeId && sedeId !== "todas") query = query.eq("sede_id", sedeId);

  const { data, error } = await query;

  if (error) throw error;

  const ids = (data || []).map((row) => row.id).filter(Boolean);
  const [conceptosResult, tributosResult] = ids.length
    ? await Promise.all([
        supabase.from("comprobante_conceptos_fiscales").select("*").eq("origen", "egreso").in("origen_id", ids),
        supabase.from("comprobante_tributos").select("*").eq("origen", "egreso").in("origen_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  if (conceptosResult.error) throw conceptosResult.error;
  if (tributosResult.error) throw tributosResult.error;
  const conceptosPorOrigen = (conceptosResult.data || []).reduce((acc, item) => {
    if (!acc[item.origen_id]) acc[item.origen_id] = [];
    acc[item.origen_id].push(item);
    return acc;
  }, {});
  const tributosPorOrigen = (tributosResult.data || []).reduce((acc, item) => {
    if (!acc[item.origen_id]) acc[item.origen_id] = [];
    acc[item.origen_id].push(item);
    return acc;
  }, {});

  return (data || []).map((row) => {
    const datosFiscales = row.datos_fiscales || {};
    const tipoComprobante = pickFiscalValue(
      { ...datosFiscales, factura_tipo: row.factura_tipo },
      ["factura_tipo", "tipoCmp", "tipoComprobante"],
      ""
    );
    const puntoVenta = pickFiscalValue(
      { ...datosFiscales, factura_punto_venta: row.factura_punto_venta },
      ["factura_punto_venta", "ptoVta", "puntoVenta"],
      ""
    );
    const numeroComprobante = pickFiscalValue(
      { ...datosFiscales, factura_numero: row.factura_numero },
      ["factura_numero", "nroCmp", "numeroComprobante"],
      ""
    );
    const proveedorCuit = pickFiscalValue(
      { ...datosFiscales, factura_cuit: row.factura_cuit },
      ["factura_cuit", "cuit", "cuitEmisor"],
      "-"
    );

    const signo = isNotaCredito(tipoComprobante) ? -1 : 1;
    const totalBase = toNumber(row.importe);
    const ivaBase = toNumber(
      pickFiscalValue(datosFiscales, ["iva", "importe_iva", "impIVA", "importeIva"], 0)
    );
    const netoBase = toNumber(
      pickFiscalValue(datosFiscales, ["neto", "importe_neto", "impNeto"], totalBase - ivaBase)
    );
    const isC = isTipoC(tipoComprobante);
    const conceptos = conceptosPorOrigen[row.id] || [];
    const tributos = tributosPorOrigen[row.id] || [];
    const totales = calcularTotalesFiscales({ conceptos, tributos });
    const total = round2(totalBase * signo);
    const iva = conceptos.length ? round2(totales.iva * signo) : isC ? 0 : round2(ivaBase * signo);
    const netoGravado = conceptos.length ? round2(totales.netoGravado * signo) : isC ? 0 : round2(netoBase * signo);
    const exento = conceptos.length ? round2(totales.exento * signo) : 0;
    const noGravado = conceptos.length ? round2(totales.noGravado * signo) : isC ? total : 0;

    return {
      id: row.id,
      fecha: normalizeDate(row.fecha),
      proveedor: row.proveedor || row.sociedad || "-",
      proveedorCuit,
      tipoComprobante,
      tipoComprobanteLabel: getTipoComprobanteLabel(tipoComprobante),
      puntoVenta,
      numeroComprobante,
      comprobante:
        puntoVenta && numeroComprobante
          ? formatVoucher(puntoVenta, numeroComprobante)
          : row.comprobante || "-",
      categoria: row.categoria || "-",
      netoGravado,
      iva,
      exento,
      noGravado,
      total,
      retenciones: round2(totales.retenciones * signo),
      percepciones: round2(totales.percepciones * signo),
      otrosTributos: round2(totales.otrosTributos * signo),
      totalFiscal: conceptos.length || tributos.length ? round2(totales.totalFinal * signo) : total,
      estado: row.estado || "-",
    };
  });
}

export function calcularResumenIvaCompras(rows) {
  return (rows || []).reduce(
    (acc, row) => ({
      netoGravado: round2(acc.netoGravado + toNumber(row.netoGravado)),
      ivaCredito: round2(acc.ivaCredito + toNumber(row.iva)),
      exento: round2(acc.exento + toNumber(row.exento)),
      noGravado: round2(acc.noGravado + toNumber(row.noGravado)),
      retenciones: round2(acc.retenciones + toNumber(row.retenciones)),
      percepciones: round2(acc.percepciones + toNumber(row.percepciones)),
      otrosTributos: round2(acc.otrosTributos + toNumber(row.otrosTributos)),
      total: round2(acc.total + toNumber(row.total)),
    }),
    {
      netoGravado: 0,
      ivaCredito: 0,
      exento: 0,
      noGravado: 0,
      retenciones: 0,
      percepciones: 0,
      otrosTributos: 0,
      total: 0,
    }
  );
}

export async function getResumenIva({ desde, hasta, sedeId } = {}) {
  const [ventas, compras] = await Promise.all([
    getLibroIvaVentas({ desde, hasta, sedeId }),
    getLibroIvaCompras({ desde, hasta, sedeId }),
  ]);

  const resumenVentas = calcularResumenIvaVentas(ventas);
  const resumenCompras = calcularResumenIvaCompras(compras);
  const ivaDebito = round2(resumenVentas.ivaDebito);
  const ivaCredito = round2(resumenCompras.ivaCredito);
  const saldoIva = round2(ivaDebito - ivaCredito);

  return {
    ventas,
    compras,
    resumenVentas,
    resumenCompras,
    ivaDebito,
    ivaCredito,
    saldoIva,
  };
}
