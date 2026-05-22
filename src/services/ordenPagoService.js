import { supabase } from "../lib/supabaseClient";
import { getEgresos, marcarEgresoPagado } from "./egresoService";
import { crearAsientoSiNoExiste, resolverCuentasPorCodigo, validarPeriodoAbierto } from "./contabilidadService";
import { generarCcDesdeOrdenPago } from "./cuentaCorrienteAutomaticaService";
import { registrarAuditoria, registrarCambioSeguro } from "./auditoriaService";

function toNumber(value) {
  return Number(value || 0);
}

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPagado(estado) {
  return normalizeText(estado) === "pagado";
}

function formatOrdenNumero(numero) {
  return `OP-${String(numero || 0).padStart(8, "0")}`;
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().split("T")[0];
  return String(value).includes("T") ? String(value).split("T")[0] : String(value);
}

function mapOrden(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    numero: row.numero,
    numeroFormateado: formatOrdenNumero(row.numero),
    proveedor: row.proveedor,
    proveedorCuit: row.proveedor_cuit,
    sociedad: row.sociedad,
    sedeId: row.sede_id,
    concepto: row.concepto,
    medioPago: row.medio_pago,
    cuentaPago: row.cuenta_pago,
    importeTotal: round2(row.importe_total),
    estado: row.estado,
    observaciones: row.observaciones,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    items: (row.orden_pago_items || []).map((item) => ({
      id: item.id,
      egresoId: item.egreso_id,
      descripcion: item.descripcion,
      importe: round2(item.importe),
      egreso: item.egresos || null,
    })),
  };
}

async function getOrdenConItems(id) {
  const { data, error } = await supabase
    .from("ordenes_pago")
    .select(`
      *,
      orden_pago_items (
        *,
        egresos (*)
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapOrden(data) : null;
}

async function getIdsEgresosAsociados() {
  const { data, error } = await supabase
    .from("orden_pago_items")
    .select("egreso_id");

  if (error) throw error;

  return new Set((data || []).map((item) => item.egreso_id).filter(Boolean));
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || null;
}

function getCuentaPagoCodigo(medioPago = "", cuentaPago = "") {
  const value = normalizeText(`${medioPago} ${cuentaPago}`);
  const esBanco = ["transferencia", "banco", "debito", "credito", "cheque", "mercado pago"].some(
    (token) => value.includes(token)
  );

  return esBanco ? "1.1.02" : "1.1.01";
}

async function validarEgresosSeleccionados(egresosIds = [], sedeId) {
  const ids = [...new Set(egresosIds.filter(Boolean))];

  if (!ids.length) {
    throw new Error("Debe seleccionar al menos un egreso.");
  }

  const egresos = await getEgresos(sedeId === "todas" ? null : sedeId);
  const selected = egresos.filter((egreso) => ids.includes(egreso.id));

  if (selected.length !== ids.length) {
    throw new Error("No se encontraron todos los egresos seleccionados.");
  }

  const pagado = selected.find((egreso) => isPagado(egreso.estado));
  if (pagado) {
    throw new Error(`El egreso ${pagado.comprobante || pagado.proveedor || pagado.id} ya está pagado.`);
  }

  const asociados = await getIdsEgresosAsociados();
  const duplicadoId = ids.find((id) => asociados.has(id));

  if (duplicadoId) {
    throw new Error("Uno de los egresos seleccionados ya está asociado a otra orden de pago.");
  }

  return selected;
}

export async function getOrdenesPago({ desde, hasta, sedeId, estado, proveedor } = {}) {
  let query = supabase
    .from("ordenes_pago")
    .select(`
      *,
      orden_pago_items (
        *,
        egresos (*)
      )
    `)
    .order("fecha", { ascending: false })
    .order("numero", { ascending: false });

  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);
  if (sedeId && sedeId !== "todas") query = query.eq("sede_id", sedeId);
  if (estado && estado !== "todos") query = query.eq("estado", estado);
  if (proveedor) query = query.ilike("proveedor", `%${proveedor}%`);

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(mapOrden);
}

export async function getEgresosPendientesParaOrdenPago({ sedeId, proveedor } = {}) {
  const [egresos, asociados] = await Promise.all([
    getEgresos(sedeId === "todas" ? null : sedeId),
    getIdsEgresosAsociados(),
  ]);
  const proveedorFiltro = normalizeText(proveedor);

  return (egresos || [])
    .filter((egreso) => !isPagado(egreso.estado))
    .filter((egreso) => !asociados.has(egreso.id))
    .filter((egreso) => !proveedorFiltro || normalizeText(egreso.proveedor).includes(proveedorFiltro))
    .map((egreso) => ({
      id: egreso.id,
      fecha: egreso.fechaDb || egreso.fecha,
      proveedor: egreso.proveedor,
      sociedad: egreso.sociedad,
      sedeId: egreso.sedeId,
      sede: egreso.sede,
      concepto: egreso.concepto,
      categoria: egreso.categoria,
      comprobante: egreso.comprobante,
      importe: round2(egreso.importe),
      estado: egreso.estado,
      datosFiscales: egreso.datosFiscales,
    }));
}

export async function crearOrdenPago(payload) {
  if (!payload?.proveedor?.trim()) {
    throw new Error("El proveedor es requerido.");
  }

  await validarPeriodoAbierto(payload.fecha || new Date().toISOString().split("T")[0]);
  const egresos = await validarEgresosSeleccionados(payload.egresosIds || [], payload.sedeId);
  const importeTotal = round2(egresos.reduce((acc, egreso) => acc + toNumber(egreso.importe), 0));
  const userId = await getCurrentUserId();

  const { data: orden, error: ordenError } = await supabase
    .from("ordenes_pago")
    .insert({
      fecha: payload.fecha || new Date().toISOString().split("T")[0],
      proveedor: payload.proveedor.trim(),
      proveedor_cuit: payload.proveedorCuit || null,
      sociedad: payload.sociedad || null,
      sede_id: payload.sedeId && payload.sedeId !== "todas" ? payload.sedeId : null,
      concepto: payload.concepto || null,
      medio_pago: payload.medioPago || null,
      cuenta_pago: payload.cuentaPago || null,
      importe_total: importeTotal,
      estado: "borrador",
      observaciones: payload.observaciones || null,
      created_by: userId,
    })
    .select("*")
    .single();

  if (ordenError) throw ordenError;

  const items = egresos.map((egreso) => ({
    orden_pago_id: orden.id,
    egreso_id: egreso.id,
    descripcion: egreso.concepto || egreso.comprobante || egreso.proveedor || null,
    importe: round2(egreso.importe),
  }));

  const { error: itemsError } = await supabase.from("orden_pago_items").insert(items);

  if (itemsError) {
    await supabase.from("ordenes_pago").delete().eq("id", orden.id);
    throw itemsError;
  }

  const ordenCreada = await getOrdenConItems(orden.id);
  await registrarAuditoria({
    modulo: "Órdenes de Pago",
    accion: "crear",
    entidad: "orden_pago",
    entidadId: ordenCreada.id,
    descripcion: `Se creó la orden de pago ${ordenCreada.numeroFormateado} para ${ordenCreada.proveedor}.`,
    datosDespues: ordenCreada,
  });

  return ordenCreada;
}

export async function aprobarOrdenPago(id) {
  const orden = await getOrdenConItems(id);

  if (!orden) throw new Error("La orden de pago no existe.");
  if (orden.estado === "pagada" || orden.estado === "anulada") {
    throw new Error("No se puede aprobar una orden pagada o anulada.");
  }

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("ordenes_pago")
    .update({
      estado: "aprobada",
      approved_by: userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  const aprobada = await getOrdenConItems(data.id);
  await registrarCambioSeguro({
    modulo: "Órdenes de Pago",
    accion: "aprobar",
    entidad: "orden_pago",
    entidadId: id,
    descripcion: `Se aprobó la orden de pago ${aprobada.numeroFormateado}.`,
    antes: orden,
    despues: aprobada,
  });
  return aprobada;
}

export async function pagarOrdenPago(id) {
  const orden = await getOrdenConItems(id);

  if (!orden) throw new Error("La orden de pago no existe.");
  if (orden.estado === "pagada") throw new Error("La orden de pago ya está pagada.");
  if (orden.estado === "anulada") throw new Error("No se puede pagar una orden anulada.");
  if (!orden.items.length) throw new Error("La orden no tiene egresos asociados.");
  await validarPeriodoAbierto(orden.fecha || new Date().toISOString().split("T")[0]);

  const egresoPagado = orden.items.find((item) => isPagado(item.egreso?.estado));
  if (egresoPagado) {
    throw new Error("Uno de los egresos asociados ya está pagado.");
  }

  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const egresosIds = orden.items.map((item) => item.egresoId);

  const { data, error } = await supabase
    .from("ordenes_pago")
    .update({
      estado: "pagada",
      paid_by: userId,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  const { error: egresosError } = await supabase
    .from("egresos")
    .update({
      estado: "Pagado",
      updated_at: now,
    })
    .in("id", egresosIds);

  if (egresosError) throw egresosError;

  try {
    const cuentaPagoCodigo = getCuentaPagoCodigo(orden.medioPago, orden.cuentaPago);
    const cuentas = await resolverCuentasPorCodigo(["2.1.01", cuentaPagoCodigo]);
    const importe = round2(orden.importeTotal);

    await crearAsientoSiNoExiste({
      fecha: dateOnly(data.paid_at || now),
      concepto: `Orden de pago ${orden.numeroFormateado} - ${orden.proveedor}`,
      origen: "orden_pago",
      origenId: orden.id,
      sedeId: orden.sedeId,
      estado: "confirmado",
      createdBy: userId,
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
  } catch (asientoError) {
    console.error("No se pudo generar el asiento de orden de pago:", asientoError);
  }

  void marcarEgresoPagado;

  const ordenPagada = await getOrdenConItems(data.id);

  try {
    await generarCcDesdeOrdenPago(ordenPagada);
  } catch (ccError) {
    console.error("Orden de pago pagada, pero no se pudo generar cuenta corriente:", ccError);
  }

  await registrarCambioSeguro({
    modulo: "Órdenes de Pago",
    accion: "pagar",
    entidad: "orden_pago",
    entidadId: id,
    descripcion: `Se pagó la orden de pago ${ordenPagada.numeroFormateado}.`,
    antes: orden,
    despues: ordenPagada,
  });

  return ordenPagada;
}

export async function anularOrdenPago(id) {
  const orden = await getOrdenConItems(id);

  if (!orden) throw new Error("La orden de pago no existe.");
  if (orden.estado === "pagada") {
    throw new Error("No se puede anular una orden pagada.");
  }

  const { data, error } = await supabase
    .from("ordenes_pago")
    .update({
      estado: "anulada",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  const anulada = await getOrdenConItems(data.id);
  await registrarAuditoria({
    modulo: "Órdenes de Pago",
    accion: "anular",
    entidad: "orden_pago",
    entidadId: id,
    descripcion: `Se anuló la orden de pago ${anulada.numeroFormateado}.`,
    severidad: "warning",
    datosAntes: orden,
    datosDespues: anulada,
  });
  return anulada;
}

export async function deleteOrdenPago(id) {
  const orden = await getOrdenConItems(id);

  if (!orden) throw new Error("La orden de pago no existe.");
  if (orden.estado !== "borrador") {
    throw new Error("Solo se pueden eliminar órdenes en borrador.");
  }

  const { error } = await supabase.from("ordenes_pago").delete().eq("id", id);
  if (error) throw error;

  await registrarAuditoria({
    modulo: "Órdenes de Pago",
    accion: "eliminar",
    entidad: "orden_pago",
    entidadId: id,
    descripcion: `Se eliminó la orden de pago ${orden.numeroFormateado}.`,
    severidad: "warning",
    datosAntes: orden,
  });
}
