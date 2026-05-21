import { supabase } from "../lib/supabaseClient";
import { registrarAsientoIngresoCobrado } from "./contabilidadAutomationService";

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
        sede_id: form.sedeId,
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
        sede_id: item.sedeId,
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
  const idParaFiltro =
    sedeId === "todas"
      ? null
      : typeof sedeId === "object"
        ? sedeId?.id
        : sedeId;

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
    query = query.or(
      `sede_id.eq.${idParaFiltro},ingreso_distribuciones.sede_id.eq.${idParaFiltro}`
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  return data.map(mapIngreso).map((item) => {
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
  const factura = await validarFacturaDuplicada(form);
  const conceptoResumen = buildConceptoResumen(form);

  const { data, error } = await supabase
    .from("ingresos")
    .insert({
      fecha: form.fecha,
      concepto: conceptoResumen,
      conceptos_items: form.conceptosItems || [],
      sociedad: form.sociedad,
      sede_id: form.sedeId,
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
    await registrarAsientoIngresoCobrado(ingreso);
  }

  return ingreso;
}

export async function deleteIngreso(id) {
  const { error } = await supabase.from("ingresos").delete().eq("id", id);

  if (error) throw error;
}

export async function marcarIngresoCobrado(id) {
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

  await registrarAsientoIngresoCobrado(
    mapIngreso({ ...(data || ingresoData), ...ingresoData, ingreso_distribuciones: [] })
  );
}
