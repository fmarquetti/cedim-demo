import { supabase } from "../lib/supabaseClient";
import {
  registrarAsientoEgresoCargado,
  registrarAsientoEgresoPagado,
} from "./contabilidadAutomationService";
import {
  generarCcDesdeEgreso,
  generarCcDesdeOrdenPago,
} from "./cuentaCorrienteAutomaticaService";
import { validarPeriodoAbierto } from "./contabilidadService";
import {
  calcularTotalesFiscales,
  extraerFiscalDesdeDatosFiscales,
  guardarConceptosFiscalesComprobante,
  guardarTributosComprobante,
} from "./fiscalService";
import { registrarAuditoria, registrarCambioSeguro } from "./auditoriaService";
import { getDbSedeId } from "../utils/sedeUtils";

function formatFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function normalizarTexto(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizarNumero(value, largo = 0) {
  const limpio = String(value || "")
    .replace(/\D/g, "");

  if (!limpio) return "";

  return largo ? limpio.padStart(largo, "0") : limpio;
}

function extraerFactura(form) {
  const datos = form.datosFiscales || {};

  const cuit = normalizarNumero(datos.cuit || form.facturaCuit);
  const tipo = normalizarTexto(
    datos.tipoCmp || datos.tipoComprobante || form.facturaTipo
  );
  const puntoVenta = normalizarNumero(
    datos.ptoVta || datos.puntoVenta || form.facturaPuntoVenta,
    4
  );
  const numero = normalizarNumero(
    datos.nroCmp || datos.numeroComprobante || form.facturaNumero,
    8
  );

  if (!cuit || !tipo || !puntoVenta || !numero) {
    return {
      factura_cuit: null,
      factura_tipo: null,
      factura_punto_venta: null,
      factura_numero: null,
      factura_clave: null,
    };
  }

  return {
    factura_cuit: cuit,
    factura_tipo: tipo,
    factura_punto_venta: puntoVenta,
    factura_numero: numero,
    factura_clave: `${cuit}-${tipo}-${puntoVenta}-${numero}`,
  };
}

async function validarFacturaDuplicada(form) {
  const factura = extraerFactura(form);

  if (!factura.factura_clave) return factura;

  const { data, error } = await supabase
    .from("egresos")
    .select("id, fecha, proveedor, sociedad, importe, comprobante")
    .eq("factura_clave", factura.factura_clave)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    throw new Error(
      `Esta factura ya fue cargada en egresos: ${data.comprobante || data.proveedor || "sin comprobante"} por $${Number(data.importe || 0).toLocaleString("es-AR")}.`
    );
  }

  return factura;
}

function mapDistribuciones(distribuciones = []) {
  return distribuciones.map((item) => ({
    id: item.id,
    sedeId: item.sede_id,
    sede: item.sedes?.nombre || "Sin sede",
    porcentaje: Number(item.porcentaje || 0),
    importe: Number(item.importe || 0),
  }));
}

function mapEgreso(row) {
  const distribuciones = mapDistribuciones(row.egreso_distribuciones || []);
  const conceptosFiscales = row.comprobante_conceptos_fiscales || [];
  const tributos = row.comprobante_tributos || [];
  const totalesFiscales =
    conceptosFiscales.length || tributos.length
      ? calcularTotalesFiscales({ conceptos: conceptosFiscales, tributos })
      : null;

  return {
    id: row.id,
    fecha: formatFecha(row.fecha),
    fechaDb: row.fecha,
    proveedor: row.proveedor,
    proveedorCuit: row.proveedor_cuit || row.datos_fiscales?.cuit || "",
    sociedad: row.sociedad,
    fechaVencimiento: row.fecha_vencimiento || "",
    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Sin sede",
    concepto: row.concepto,
    conceptosItems: row.conceptos_items || [],
    importe: Number(row.importe || 0),
    categoria: row.categoria,
    estado: row.estado,
    archivo: row.archivo,
    comprobante: row.comprobante,
    datosFiscales: row.datos_fiscales,
    conceptosFiscales,
    tributos,
    totalesFiscales,
    distribuciones,
    tieneDistribucion: distribuciones.length > 0,
  };
}

function buildFiscalDesdeDetalle(detalleFiscal = {}) {
  const neto = Number(detalleFiscal.netoGravado || 0);
  const iva = Number(detalleFiscal.iva || 0);
  const exento = Number(detalleFiscal.exento || 0);
  const noGravado = Number(detalleFiscal.noGravado || 0);
  const conceptos = [];

  if (neto + iva + exento + noGravado > 0) {
    conceptos.push({
      descripcion: "Detalle fiscal egreso",
      tipo: neto > 0 && (exento > 0 || noGravado > 0) ? "mixto" : neto > 0 ? "gravado" : exento > 0 ? "exento" : "no_gravado",
      neto,
      iva,
      exento,
      noGravado,
      total: neto + iva + exento + noGravado,
    });
  }

  const tributos = [
    { codigo: "PERC_IVA", descripcion: "Percepcion IVA", categoria: "percepcion", importe: detalleFiscal.percepcionIva },
    { codigo: "PERC_IIBB", descripcion: "Percepcion Ingresos Brutos", categoria: "percepcion", importe: detalleFiscal.percepcionIibb },
    { codigo: "RET_GANANCIAS", descripcion: "Retencion Ganancias", categoria: "retencion", importe: detalleFiscal.retencionGanancias },
    { codigo: "RET_IVA", descripcion: "Retencion IVA", categoria: "retencion", importe: detalleFiscal.retencionIva },
    { codigo: "RET_IIBB", descripcion: "Retencion Ingresos Brutos", categoria: "retencion", importe: detalleFiscal.retencionIibb },
    { codigo: "OTRO_TRIBUTO", descripcion: "Otros tributos", categoria: "otro", importe: detalleFiscal.otrosTributos },
  ].filter((item) => Number(item.importe || 0) > 0);

  return { conceptos, tributos };
}

function buildFiscalPayload(form) {
  const desdeDetalle = buildFiscalDesdeDetalle(form.detalleFiscal || {});
  if (desdeDetalle.conceptos.length || desdeDetalle.tributos.length) return desdeDetalle;
  if (!form.datosFiscales) return { conceptos: [], tributos: [] };
  return extraerFiscalDesdeDatosFiscales(form.datosFiscales, form.importe);
}

function buildDistribuciones(form, egresoId) {
  const importeTotal = Number(form.importe || 0);
  const distribuciones = Array.isArray(form.distribuciones)
    ? form.distribuciones
    : [];

  if (!distribuciones.length) {
    return [
      {
        egreso_id: egresoId,
        sede_id: getDbSedeId(form.sedeId),
        porcentaje: 100,
        importe: importeTotal,
      },
    ];
  }

  return distribuciones
    .filter((item) => item.sedeId && Number(item.porcentaje || 0) > 0)
    .map((item) => {
      const porcentaje = Number(item.porcentaje || 0);
      return {
        egreso_id: egresoId,
        sede_id: getDbSedeId(item.sedeId),
        porcentaje,
        importe: Number(((importeTotal * porcentaje) / 100).toFixed(2)),
      };
    });
}

function validarDistribuciones(form) {
  const distribuciones = Array.isArray(form.distribuciones)
    ? form.distribuciones.filter((item) => item.sedeId && Number(item.porcentaje || 0) > 0)
    : [];

  if (!distribuciones.length) return;

  const total = distribuciones.reduce(
    (acc, item) => acc + Number(item.porcentaje || 0),
    0
  );

  if (Math.abs(total - 100) > 0.01) {
    throw new Error("La distribución entre sedes debe sumar exactamente 100%.");
  }

  const sedesUnicas = new Set(distribuciones.map((item) => item.sedeId));
  if (sedesUnicas.size !== distribuciones.length) {
    throw new Error("No podés repetir la misma sede en la distribución.");
  }
}

export async function getEgresos(sedeId = null) {
  const idParaFiltro = getDbSedeId(sedeId);
  let idsPorDistribucion = [];

  if (idParaFiltro) {
    const { data: distribucionesData, error: distribucionesError } = await supabase
      .from("egreso_distribuciones")
      .select("egreso_id")
      .eq("sede_id", idParaFiltro);

    if (distribucionesError) throw distribucionesError;

    idsPorDistribucion = [
      ...new Set((distribucionesData || []).map((item) => item.egreso_id).filter(Boolean)),
    ];
  }

  let query = supabase
    .from("egresos")
    .select(`
      *,
      sedes (
        id,
        nombre
      ),
      egreso_distribuciones (
        id,
        sede_id,
        porcentaje,
        importe,
        sedes (
          id,
          nombre
        )
      )
    `)
    .order("fecha", { ascending: false });

  if (idParaFiltro) {
    const filtros = [`sede_id.eq.${idParaFiltro}`];
    if (idsPorDistribucion.length) {
      filtros.push(`id.in.(${idsPorDistribucion.join(",")})`);
    }
    query = query.or(filtros.join(","));
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(mapEgreso).map((item) => {
    if (!idParaFiltro) return item;

    const distribucionSede = item.distribuciones.find(
      (dist) => dist.sedeId === idParaFiltro
    );

    if (!distribucionSede) return item;

    return {
      ...item,
      importeOriginal: item.importe,
      importe: distribucionSede.importe,
      porcentajeAplicado: distribucionSede.porcentaje,
      sede: distribucionSede.sede,
      sedeId: distribucionSede.sedeId,
    };
  });
}

function buildConceptoResumen(form) {
  const items = Array.isArray(form.conceptosItems) ? form.conceptosItems : [];

  if (items.length) {
    return items.map((item) => item.nombre).join(", ");
  }

  return form.concepto || "";
}

export async function createEgreso(form) {
  validarDistribuciones(form);
  await validarPeriodoAbierto(form.fecha);
  const factura = await validarFacturaDuplicada(form);
  const conceptoResumen = buildConceptoResumen(form);  

  const { data, error } = await supabase
    .from("egresos")
    .insert({
      fecha: form.fecha,
      proveedor: form.proveedor,
      proveedor_cuit: form.proveedorCuit || form.proveedor_cuit || null,
      sociedad: form.sociedad,
      fecha_vencimiento: form.fechaVencimiento || form.fecha_vencimiento || null,
      sede_id: getDbSedeId(form.sedeId),
      concepto: conceptoResumen,
      conceptos_items: form.conceptosItems || [],
      importe: Number(form.importe || 0),
      categoria: form.categoria,
      estado: form.estado || "Pendiente",
      archivo: form.archivo || null,
      comprobante: form.comprobante || null,
      datos_fiscales: form.detalleFiscal
        ? { ...(form.datosFiscales || {}), detalleFiscal: form.detalleFiscal }
        : form.datosFiscales || null,
      factura_cuit: factura.factura_cuit,
      factura_tipo: factura.factura_tipo,
      factura_punto_venta: factura.factura_punto_venta,
      factura_numero: factura.factura_numero,
      factura_clave: factura.factura_clave,
    })
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .single();

  if (error) throw error;

  const distribuciones = buildDistribuciones(form, data.id);

  const { error: distribucionError } = await supabase
    .from("egreso_distribuciones")
    .insert(distribuciones);

  if (distribucionError) {
    await supabase.from("egresos").delete().eq("id", data.id);
    throw distribucionError;
  }

  const egreso = mapEgreso({ ...data, egreso_distribuciones: [] });
  const fiscalPayload = buildFiscalPayload(form);

  if (fiscalPayload.conceptos.length || fiscalPayload.tributos.length) {
    egreso.conceptosFiscales = await guardarConceptosFiscalesComprobante({
      origen: "egreso",
      origenId: egreso.id,
      conceptos: fiscalPayload.conceptos,
    });
    egreso.tributos = await guardarTributosComprobante({
      origen: "egreso",
      origenId: egreso.id,
      tributos: fiscalPayload.tributos,
    });
    egreso.totalesFiscales = calcularTotalesFiscales({
      conceptos: egreso.conceptosFiscales,
      tributos: egreso.tributos,
    });
  }

  await registrarAsientoEgresoCargado(egreso);

  try {
    await generarCcDesdeEgreso(egreso);
  } catch (ccError) {
    console.error("Egreso creado, pero no se pudo generar cuenta corriente:", ccError);
  }

  if (egreso.estado === "Pagado") {
    await validarPeriodoAbierto(egreso.fechaDb || form.fecha);
    await registrarAsientoEgresoPagado(egreso);
    try {
      await generarCcDesdeOrdenPago({
        id: egreso.id,
        fecha: egreso.fechaDb || form.fecha,
        numero: 0,
        numeroFormateado: egreso.comprobante || `Egreso ${egreso.id}`,
        proveedor: egreso.proveedor,
        proveedorCuit: egreso.datosFiscales?.cuit,
        sociedad: egreso.sociedad,
        sedeId: egreso.sedeId,
        importeTotal: egreso.importe,
        medioPago: "Pago directo",
      });
    } catch (ccError) {
      console.error("Egreso pagado, pero no se pudo generar pago en cuenta corriente:", ccError);
    }
  }

  await registrarAuditoria({
    modulo: "Egresos",
    accion: "crear",
    entidad: "egreso",
    entidadId: egreso.id,
    descripcion: `Se creó el egreso ${egreso.comprobante || egreso.concepto || egreso.id}.`,
    datosDespues: egreso,
  });

  return egreso;
}

export async function deleteEgreso(id) {
  const { data: antes, error: antesError } = await supabase
    .from("egresos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (antesError) throw antesError;

  const { error } = await supabase.from("egresos").delete().eq("id", id);

  if (error) throw error;

  await registrarAuditoria({
    modulo: "Egresos",
    accion: "eliminar",
    entidad: "egreso",
    entidadId: id,
    descripcion: `Se eliminó el egreso ${antes?.comprobante || antes?.concepto || id}.`,
    severidad: "warning",
    datosAntes: antes,
  });
}

export async function marcarEgresoPagado(id) {
  const { data: egresoActual, error: actualError } = await supabase
    .from("egresos")
    .select("*")
    .eq("id", id)
    .single();

  if (actualError) throw actualError;

  await validarPeriodoAbierto(egresoActual?.fecha || new Date().toISOString().split("T")[0]);

  const { error } = await supabase
    .from("egresos")
    .update({
      estado: "Pagado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

  const { data: egresoData, error: egresoError } = await supabase
    .from("egresos")
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .eq("id", id)
    .single();

  if (egresoError) throw egresoError;

  await registrarAsientoEgresoPagado(
    mapEgreso({ ...egresoData, egreso_distribuciones: [] })
  );

  await registrarCambioSeguro({
    modulo: "Egresos",
    accion: "marcar_pagado",
    entidad: "egreso",
    entidadId: id,
    descripcion: `Se marcó como pagado el egreso ${egresoData.comprobante || egresoData.concepto || id}.`,
    antes: egresoActual,
    despues: egresoData,
  });
}
