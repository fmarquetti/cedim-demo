import { supabase } from "../lib/supabaseClient";
import { registrarCambioSeguro } from "./auditoriaService";

const ORIGENES = ["egreso", "arca_invoice", "ingreso", "manual"];
const CATEGORIAS = ["retencion", "percepcion", "impuesto", "tasa", "otro"];

export function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function round2(value) {
  return Number(toNumber(value).toFixed(2));
}

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function assertOrigen(origen, origenId) {
  if (!ORIGENES.includes(origen)) throw new Error("Origen fiscal invalido.");
  if (!origenId) throw new Error("El ID de origen fiscal es requerido.");
}

function pick(source, keys, fallback = 0) {
  const key = keys.find((item) => source?.[item] !== undefined && source?.[item] !== null && source?.[item] !== "");
  return key ? source[key] : fallback;
}

function mapTributo(row) {
  return {
    id: row.id,
    origen: row.origen,
    origenId: row.origen_id,
    tributoTipoId: row.tributo_tipo_id,
    tipo: row.tributos_tipos || null,
    codigo: row.codigo,
    descripcion: row.descripcion,
    categoria: row.categoria,
    baseImponible: round2(row.base_imponible),
    alicuota: row.alicuota === null ? null : toNumber(row.alicuota),
    importe: round2(row.importe),
    signo: Number(row.signo || 1),
  };
}

function mapConcepto(row) {
  return {
    id: row.id,
    origen: row.origen,
    origenId: row.origen_id,
    descripcion: row.descripcion,
    tipo: row.tipo,
    neto: round2(row.neto),
    iva: round2(row.iva),
    alicuotaIva: row.alicuota_iva === null ? null : toNumber(row.alicuota_iva),
    exento: round2(row.exento),
    noGravado: round2(row.no_gravado),
    total: round2(row.total),
  };
}

export async function getTiposTributos({ categoria, activo } = {}) {
  let query = supabase
    .from("tributos_tipos")
    .select("*, contabilidad_cuentas (*)")
    .order("categoria", { ascending: true })
    .order("nombre", { ascending: true });

  if (categoria) query = query.eq("categoria", categoria);
  if (typeof activo === "boolean") query = query.eq("activo", activo);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function guardarTributosComprobante({ origen, origenId, tributos }) {
  assertOrigen(origen, origenId);
  const antes = await getTributosComprobante({ origen, origenId });

  const { error: deleteError } = await supabase
    .from("comprobante_tributos")
    .delete()
    .eq("origen", origen)
    .eq("origen_id", origenId);
  if (deleteError) throw deleteError;

  const payload = (Array.isArray(tributos) ? tributos : [])
    .map((tributo) => ({
      origen,
      origen_id: origenId,
      tributo_tipo_id: tributo.tributoTipoId || tributo.tributo_tipo_id || null,
      codigo: tributo.codigo || null,
      descripcion: String(tributo.descripcion || tributo.codigo || "Tributo").trim(),
      categoria: tributo.categoria,
      base_imponible: round2(tributo.baseImponible ?? tributo.base_imponible),
      alicuota: tributo.alicuota === "" || tributo.alicuota === undefined ? null : toNumber(tributo.alicuota),
      importe: round2(tributo.importe),
      signo: Number(tributo.signo || 1) === -1 ? -1 : 1,
    }))
    .filter((tributo) => CATEGORIAS.includes(tributo.categoria) && tributo.importe > 0);

  if (!payload.length) return [];

  const { data, error } = await supabase
    .from("comprobante_tributos")
    .insert(payload)
    .select("*, tributos_tipos (*)");
  if (error) throw error;
  const despues = (data || []).map(mapTributo);
  await registrarCambioSeguro({
    modulo: "Configuración Fiscal",
    accion: "guardar_tributos_comprobante",
    entidad: "comprobante_tributos",
    entidadId: origenId,
    descripcion: `Se actualizaron tributos fiscales para ${origen}.`,
    antes,
    despues,
    metadata: { origen },
  });

  return despues;
}

export async function getTributosComprobante({ origen, origenId }) {
  assertOrigen(origen, origenId);
  const { data, error } = await supabase
    .from("comprobante_tributos")
    .select("*, tributos_tipos (*)")
    .eq("origen", origen)
    .eq("origen_id", origenId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapTributo);
}

export async function guardarConceptosFiscalesComprobante({ origen, origenId, conceptos }) {
  assertOrigen(origen, origenId);
  const antes = await getConceptosFiscalesComprobante({ origen, origenId });

  const { error: deleteError } = await supabase
    .from("comprobante_conceptos_fiscales")
    .delete()
    .eq("origen", origen)
    .eq("origen_id", origenId);
  if (deleteError) throw deleteError;

  const payload = (Array.isArray(conceptos) ? conceptos : [])
    .map((concepto) => {
      const neto = round2(concepto.neto);
      const iva = round2(concepto.iva);
      const exento = round2(concepto.exento);
      const noGravado = round2(concepto.noGravado ?? concepto.no_gravado);
      const total = round2(concepto.total || neto + iva + exento + noGravado);
      return {
        origen,
        origen_id: origenId,
        descripcion: String(concepto.descripcion || "Concepto fiscal").trim(),
        tipo: concepto.tipo || (iva > 0 || neto > 0 ? "gravado" : exento > 0 ? "exento" : "no_gravado"),
        neto,
        iva,
        alicuota_iva: concepto.alicuotaIva ?? concepto.alicuota_iva ?? null,
        exento,
        no_gravado: noGravado,
        total,
      };
    })
    .filter((concepto) => concepto.neto + concepto.iva + concepto.exento + concepto.no_gravado + concepto.total > 0);

  if (!payload.length) return [];

  const { data, error } = await supabase
    .from("comprobante_conceptos_fiscales")
    .insert(payload)
    .select("*");
  if (error) throw error;
  const despues = (data || []).map(mapConcepto);
  await registrarCambioSeguro({
    modulo: "Configuración Fiscal",
    accion: "guardar_conceptos_fiscales_comprobante",
    entidad: "comprobante_conceptos_fiscales",
    entidadId: origenId,
    descripcion: `Se actualizaron conceptos fiscales para ${origen}.`,
    antes,
    despues,
    metadata: { origen },
  });

  return despues;
}

export async function getConceptosFiscalesComprobante({ origen, origenId }) {
  assertOrigen(origen, origenId);
  const { data, error } = await supabase
    .from("comprobante_conceptos_fiscales")
    .select("*")
    .eq("origen", origen)
    .eq("origen_id", origenId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapConcepto);
}

export function calcularTotalesFiscales({ conceptos, tributos }) {
  const conceptosList = Array.isArray(conceptos) ? conceptos : [];
  const tributosList = Array.isArray(tributos) ? tributos : [];
  const netoGravado = round2(conceptosList.reduce((acc, item) => acc + toNumber(item.neto), 0));
  const iva = round2(conceptosList.reduce((acc, item) => acc + toNumber(item.iva), 0));
  const exento = round2(conceptosList.reduce((acc, item) => acc + toNumber(item.exento), 0));
  const noGravado = round2(conceptosList.reduce((acc, item) => acc + toNumber(item.noGravado ?? item.no_gravado), 0));
  const totalConceptos = round2(conceptosList.reduce((acc, item) => acc + toNumber(item.total), 0));
  const sumaCategoria = (categorias) =>
    round2(tributosList.filter((item) => categorias.includes(item.categoria)).reduce((acc, item) => acc + toNumber(item.importe), 0));
  const retenciones = sumaCategoria(["retencion"]);
  const percepciones = sumaCategoria(["percepcion"]);
  const otrosTributos = sumaCategoria(["impuesto", "tasa", "otro"]);
  const totalTributos = round2(percepciones + otrosTributos - retenciones);
  const totalFinal = round2(totalConceptos + totalTributos);

  return { netoGravado, iva, exento, noGravado, otrosTributos, retenciones, percepciones, totalConceptos, totalTributos, totalFinal };
}

export function extraerFiscalDesdeDatosFiscales(datosFiscales, importeTotal) {
  const datos = datosFiscales || {};
  const total = round2(pick(datos, ["impTotal", "importe_total", "importe", "total"], importeTotal));
  const neto = round2(pick(datos, ["impNeto", "importe_neto", "neto"], 0));
  const iva = round2(pick(datos, ["impIVA", "importe_iva", "importeIva", "iva"], 0));
  const exento = round2(pick(datos, ["impOpEx", "exento"], 0));
  const noGravado = round2(pick(datos, ["impTotConc", "noGravado", "no_gravado"], 0));

  const tributos = [];
  const addTributo = (categoria, codigo, descripcion, importe) => {
    const value = round2(importe);
    if (value > 0) tributos.push({ categoria, codigo, descripcion, importe: value, signo: 1 });
  };

  (Array.isArray(datos.tributos) ? datos.tributos : []).forEach((item, index) => {
    addTributo(item.categoria || "otro", item.codigo || `TRIBUTO_${index + 1}`, item.descripcion || item.nombre || "Tributo", item.importe);
  });
  addTributo("otro", "OTROS_TRIBUTOS", "Otros tributos", pick(datos, ["otrosTributos"], 0));
  addTributo("percepcion", "PERCEPCIONES", "Percepciones", pick(datos, ["percepciones"], 0));
  addTributo("retencion", "RETENCIONES", "Retenciones", pick(datos, ["retenciones"], 0));

  const totalConcepto = round2(neto + iva + exento + noGravado);
  const conceptos = [];
  if (totalConcepto > 0) {
    conceptos.push({
      descripcion: "Detalle fiscal",
      tipo: neto > 0 && (exento > 0 || noGravado > 0) ? "mixto" : neto > 0 ? "gravado" : exento > 0 ? "exento" : "no_gravado",
      neto,
      iva,
      exento,
      noGravado,
      total: totalConcepto,
    });
  } else if (total > 0) {
    conceptos.push({
      descripcion: "Importe del comprobante",
      tipo: iva > 0 ? "gravado" : "no_gravado",
      neto: iva > 0 ? round2(total - iva) : 0,
      iva,
      exento: 0,
      noGravado: iva > 0 ? 0 : total,
      total,
    });
  }

  return { conceptos, tributos };
}
