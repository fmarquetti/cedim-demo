import {
  anularMovimientoCuentaCorriente,
  crearMovimientoCuentaCorriente,
  getMovimientosCuentaCorriente,
  upsertEntidadCuentaCorriente,
} from "./cuentaCorrienteEntidadService";

function capitalize(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function mapEstado(estado) {
  return String(estado || "").toLowerCase() === "aplicado"
    ? "Aplicado"
    : "Pendiente";
}

function mapTipoEntidad(tipoEntidad) {
  const tipo = String(tipoEntidad || "").toLowerCase();
  if (tipo === "cliente") return "Obra social";
  if (tipo === "proveedor") return "Proveedor";
  return capitalize(tipoEntidad);
}

function mapComprobante(movimiento) {
  const descripcion = String(movimiento?.descripcion || "");

  if (descripcion.toLowerCase().includes("nota de credito")) {
    return "Nota de Crédito";
  }

  if (descripcion.toLowerCase().includes("nota de debito")) {
    return "Nota de Débito";
  }

  if (movimiento?.tipoMovimiento === "factura") return "Factura";
  if (movimiento?.tipoMovimiento === "cobro") return "Recibo";
  if (movimiento?.tipoMovimiento === "pago") return "Recibo";

  return movimiento?.comprobante ? "Factura" : "Ajuste";
}

function mapImporte(movimiento) {
  return Number(movimiento?.debe || movimiento?.haber || 0);
}

function mapMovimiento(movimiento) {
  const comprobanteRaw = String(movimiento?.comprobante || "");

  return {
    id: movimiento.id,
    fecha: movimiento.fecha,
    entidad: movimiento.entidad?.nombre || movimiento.metadata?.sociedad || "-",
    tipoEntidad: mapTipoEntidad(movimiento.tipoEntidad),
    sedeId: movimiento.sedeId,
    sede: movimiento.metadata?.sede || "Sin sede",
    comprobante: mapComprobante(movimiento),
    numero: comprobanteRaw,
    concepto: movimiento.descripcion || "",
    importe: mapImporte(movimiento),
    vencimiento: movimiento.fechaVencimiento || "",
    estado: mapEstado(movimiento.estado),
  };
}

export async function getCuentasCorrientes(sedeId = null) {
  const data = await getMovimientosCuentaCorriente({ sedeId });
  return (data || []).map(mapMovimiento).sort((a, b) => {
    if (a.fecha === b.fecha) return String(b.id).localeCompare(String(a.id));
    return String(b.fecha).localeCompare(String(a.fecha));
  });
}

export async function createCuentaCorriente(form) {
  const entidad = await upsertEntidadCuentaCorriente({
    tipo: String(form?.tipoEntidad || "").toLowerCase() === "proveedor" ? "proveedor" : "cliente",
    nombre: form?.entidad,
  });

  const esProveedor = String(form?.tipoEntidad || "").toLowerCase() === "proveedor";
  const importe = Number(form?.importe || 0);
  const comprobante = form?.numero || form?.comprobante || "";
  const tipoMovimiento = String(form?.comprobante || "").toLowerCase().includes("crédito")
    ? "nota_credito"
    : String(form?.comprobante || "").toLowerCase().includes("debito")
      ? "nota_debito"
      : String(form?.comprobante || "").toLowerCase().includes("recibo")
        ? esProveedor
          ? "pago"
          : "cobro"
        : "factura";

  const { movimiento } = await crearMovimientoCuentaCorriente({
    entidadId: entidad.id,
    fecha: form.fecha,
    tipoEntidad: esProveedor ? "proveedor" : "cliente",
    tipoMovimiento,
    origen: "manual",
    descripcion: form.concepto,
    comprobante,
    debe:
      esProveedor
        ? tipoMovimiento === "pago"
          ? 0
          : importe
        : tipoMovimiento === "cobro" || tipoMovimiento === "nota_credito"
          ? 0
          : importe,
    haber:
      esProveedor
        ? tipoMovimiento === "pago"
          ? importe
          : 0
        : tipoMovimiento === "cobro" || tipoMovimiento === "nota_credito"
          ? importe
          : 0,
    estado: mapEstado(form.estado).toLowerCase(),
    sedeId: form.sedeId,
    metadata: {
      fecha_vencimiento: form.vencimiento || null,
    },
  });

  return mapMovimiento(movimiento);
}

export async function deleteCuentaCorriente(id) {
  return anularMovimientoCuentaCorriente(id);
}

export async function marcarCuentaAplicada(id) {
  throw new Error("La cuenta corriente unificada ya no soporta esta acción desde el servicio legado.");
}
