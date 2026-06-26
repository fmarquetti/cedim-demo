import { supabase } from "../lib/supabaseClient";
import { registrarAsientoIngresoCobrado } from "./contabilidadAutomationService";
import { generarCcDesdeIngresoCobrado } from "./cuentaCorrienteAutomaticaService";
import { validarPeriodoAbierto } from "./contabilidadService";
import { registrarAuditoria, registrarCambioSeguro } from "./auditoriaService";
import { getDbSedeId } from "../utils/sedeUtils";

function formatFecha(fecha) {
  if (!fecha) return "";
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
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
    .from("ingresos")
    .select("id, fecha, concepto, sociedad, importe, comprobante")
    .eq("factura_clave", factura.factura_clave)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    throw new Error(
      `Esta factura ya fue cargada en ingresos: ${data.comprobante || data.concepto || "sin comprobante"} por $${Number(data.importe || 0).toLocaleString("es-AR")}.`
    );
  }

  return factura;
}

function mapIngreso(row) {
  const distribuciones = mapDistribuciones(row.ingreso_distribuciones || []);

  return {
    id: row.id,
    fecha: formatFecha(row.fecha),
    fechaDb: row.fecha,
    concepto: row.concepto,
    conceptosItems: row.conceptos_items || [],
    sociedad: row.sociedad,
    sedeId: row.sede_id,
    sede: row.sedes?.nombre || "Sin sede",
    origen: row.origen,
    importe: Number(row.importe || 0),
    cobro: row.cobro,
    estado: row.estado,
    archivo: row.archivo,
    comprobante: row.comprobante,
    datosFiscales: row.datos_fiscales,
    distribuciones,
    tieneDistribucion: distribuciones.length > 0,
  };
}

function buildDistribuciones(form, ingresoId) {
  const importeTotal = Number(form.importe || 0);
  const distribuciones = Array.isArray(form.distribuciones)
    ? form.distribuciones
    : [];

  if (!distribuciones.length) {
    return [
      {
        ingreso_id: ingresoId,
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
        ingreso_id: ingresoId,
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

export async function getIngresos(sedeId = null) {
  const idParaFiltro = getDbSedeId(sedeId);
  let idsPorDistribucion = [];

  if (idParaFiltro) {
    const { data: distribucionesData, error: distribucionesError } = await supabase
      .from("ingreso_distribuciones")
      .select("ingreso_id")
      .eq("sede_id", idParaFiltro);

    if (distribucionesError) throw distribucionesError;

    idsPorDistribucion = [
      ...new Set((distribucionesData || []).map((item) => item.ingreso_id).filter(Boolean)),
    ];
  }

  let query = supabase
    .from("ingresos")
    .select(`
      *,
      sedes (
        id,
        nombre
      ),
      ingreso_distribuciones (
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

  return (data || []).map(mapIngreso).map((item) => {
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

export async function createIngreso(form) {
  validarDistribuciones(form);
  await validarPeriodoAbierto(form.fecha);
  const factura = await validarFacturaDuplicada(form);
  const conceptoResumen = buildConceptoResumen(form);

  const { data, error } = await supabase
    .from("ingresos")
    .insert({
      fecha: form.fecha,
      concepto: conceptoResumen,
      conceptos_items: form.conceptosItems || [],
      sociedad: form.sociedad,
      sede_id: getDbSedeId(form.sedeId),
      origen: form.origen,
      importe: Number(form.importe || 0),
      cobro: form.cobro,
      estado: form.estado || "Pendiente",
      archivo: form.archivo || null,
      comprobante: form.comprobante || null,
      datos_fiscales: form.datosFiscales || null,
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
    .from("ingreso_distribuciones")
    .insert(distribuciones);

  if (distribucionError) {
    await supabase.from("ingresos").delete().eq("id", data.id);
    throw distribucionError;
  }

  const ingreso = mapIngreso({ ...data, ingreso_distribuciones: [] });

  if (ingreso.estado === "Cobrado") {
    await validarPeriodoAbierto(ingreso.fechaDb || form.fecha);
    await registrarAsientoIngresoCobrado(ingreso);
    try {
      await generarCcDesdeIngresoCobrado(ingreso);
    } catch (ccError) {
      console.error("Ingreso cobrado, pero no se pudo generar cuenta corriente:", ccError);
    }
  }

  await registrarAuditoria({
    modulo: "Ingresos",
    accion: "crear",
    entidad: "ingreso",
    entidadId: ingreso.id,
    descripcion: `Se creó el ingreso ${ingreso.comprobante || ingreso.concepto || ingreso.id}.`,
    datosDespues: ingreso,
  });

  return ingreso;
}

export async function deleteIngreso(id) {
  const { data: antes, error: antesError } = await supabase
    .from("ingresos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (antesError) throw antesError;

  const { error } = await supabase.from("ingresos").delete().eq("id", id);

  if (error) throw error;

  await registrarAuditoria({
    modulo: "Ingresos",
    accion: "eliminar",
    entidad: "ingreso",
    entidadId: id,
    descripcion: `Se eliminó el ingreso ${antes?.comprobante || antes?.concepto || id}.`,
    severidad: "warning",
    datosAntes: antes,
  });
}

export async function marcarIngresoCobrado(id) {
  const { data: ingresoActual, error: actualError } = await supabase
    .from("ingresos")
    .select("*")
    .eq("id", id)
    .single();

  if (actualError) throw actualError;

  await validarPeriodoAbierto(ingresoActual?.fecha || new Date().toISOString().split("T")[0]);

  const { data, error } = await supabase
    .from("ingresos")
    .update({
      estado: "Cobrado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

  const { data: ingresoData, error: ingresoError } = await supabase
    .from("ingresos")
    .select(`
      *,
      sedes (
        id,
        nombre
      )
    `)
    .eq("id", id)
    .single();

  if (ingresoError) throw ingresoError;

  const ingresoActualizado = mapIngreso({
    ...(data || ingresoData),
    ...ingresoData,
    ingreso_distribuciones: [],
  });

  await registrarAsientoIngresoCobrado(ingresoActualizado);

  try {
    await generarCcDesdeIngresoCobrado(ingresoActualizado);
  } catch (ccError) {
    console.error("Ingreso cobrado, pero no se pudo generar cuenta corriente:", ccError);
  }

  await registrarCambioSeguro({
    modulo: "Ingresos",
    accion: "marcar_cobrado",
    entidad: "ingreso",
    entidadId: id,
    descripcion: `Se marcó como cobrado el ingreso ${ingresoActualizado.comprobante || ingresoActualizado.concepto || id}.`,
    antes: ingresoActual,
    despues: ingresoActualizado,
  });
}
