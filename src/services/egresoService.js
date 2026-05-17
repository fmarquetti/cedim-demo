import { supabase } from "../lib/supabaseClient";

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

  return {
    id: row.id,
    fecha: formatFecha(row.fecha),
    fechaDb: row.fecha,
    proveedor: row.proveedor,
    sociedad: row.sociedad,
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
    distribuciones,
    tieneDistribucion: distribuciones.length > 0,
  };
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
        egreso_id: egresoId,
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

export async function getEgresos(sedeId = null) {
  const idParaFiltro = sedeId === "todas" ? null : sedeId;

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
    query = query.or(
      `sede_id.eq.${idParaFiltro},egreso_distribuciones.sede_id.eq.${idParaFiltro}`
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  return data.map(mapEgreso).map((item) => {
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
  const factura = await validarFacturaDuplicada(form);
  const conceptoResumen = buildConceptoResumen(form);  

  const { data, error } = await supabase
    .from("egresos")
    .insert({
      fecha: form.fecha,
      proveedor: form.proveedor,
      sociedad: form.sociedad,
      sede_id: form.sedeId,
      concepto: conceptoResumen,
      conceptos_items: form.conceptosItems || [],
      importe: Number(form.importe || 0),
      categoria: form.categoria,
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
    .from("egreso_distribuciones")
    .insert(distribuciones);

  if (distribucionError) {
    await supabase.from("egresos").delete().eq("id", data.id);
    throw distribucionError;
  }

  return mapEgreso({ ...data, egreso_distribuciones: [] });
}

export async function deleteEgreso(id) {
  const { error } = await supabase.from("egresos").delete().eq("id", id);

  if (error) throw error;
}

export async function marcarEgresoPagado(id) {
  const { error } = await supabase
    .from("egresos")
    .update({
      estado: "Pagado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}