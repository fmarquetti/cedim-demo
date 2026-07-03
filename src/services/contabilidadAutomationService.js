import {
  asientoContableExiste,
  crearAsientoContable,
  getCuentasContables,
  mapearCuentaPorDefecto,
} from "./contabilidadService";

let cuentasCache = null;

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().split("T")[0];
  return String(value).includes("T") ? String(value).split("T")[0] : String(value);
}

function normalizeEstado(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPaid(value) {
  return ["cobrado", "pagado", "conciliado"].includes(normalizeEstado(value));
}

function getFiscalNumber(...values) {
  for (const value of values) {
    const number = toMoney(value);
    if (number > 0) return number;
  }

  return 0;
}

async function getCuentaByCodigo(codigo) {
  if (!cuentasCache) {
    cuentasCache = await getCuentasContables();
  }

  const cuenta = cuentasCache.find((item) => item.codigo === codigo);

  if (!cuenta) {
    throw new Error(`No existe la cuenta contable ${codigo}.`);
  }

  return cuenta;
}

async function getCuentaDefault(tipo) {
  const codigo = mapearCuentaPorDefecto(tipo);
  if (!codigo) throw new Error(`No hay cuenta contable por defecto para ${tipo}.`);
  return getCuentaByCodigo(codigo);
}

async function buildLinea(tipoCuenta, lado, importe, descripcion = "") {
  const cuenta = await getCuentaDefault(tipoCuenta);

  return {
    cuentaId: cuenta.id,
    descripcion,
    debe: lado === "debe" ? toMoney(importe) : 0,
    haber: lado === "haber" ? toMoney(importe) : 0,
  };
}

function getCuentaCajaOBancos(forma = "") {
  const formaNormalizada = normalizeText(forma);

  if (["efectivo", "caja"].includes(formaNormalizada)) {
    return "caja";
  }

  return "bancos";
}

function getCuentaEgresoPorCategoria(categoria = "") {
  const value = normalizeText(categoria);

  if (["insumos", "reactivos", "compras"].includes(value)) return "compras";
  if (["servicios", "mantenimiento", "alquileres"].includes(value)) return "gastosAdministrativos";
  if (["sueldos", "honorarios"].includes(value)) return "gastosAdministrativos";
  if (["impuestos", "tasas", "impuestos y tasas"].includes(value)) return "otrosEgresos";

  return "otrosEgresos";
}

async function crearAsientoSiNoExiste(payload) {
  if (await asientoContableExiste(payload.origen, payload.origenId)) {
    return null;
  }

  return crearAsientoContable(payload);
}

export async function registrarAsientoFacturaArca(invoice) {
  if (!invoice?.id || invoice.es_fiscal === false || invoice.estado === "anulada") {
    return null;
  }

  const tipoComprobante = Number(invoice.tipo_comprobante || 0);
  const esNotaCredito = [3, 8, 13].includes(tipoComprobante);
  const total = Math.abs(toMoney(invoice.importe_total));
  const iva = Math.abs(getFiscalNumber(invoice.importe_iva));
  const neto = Math.abs(getFiscalNumber(invoice.importe_neto, total - iva, total));

  if (total <= 0) return null;

  const concepto = `${esNotaCredito ? "Nota de credito ARCA" : "Factura ARCA"} ${invoice.cliente_nombre || ""}`.trim();
  const descripcion = invoice.descripcion || invoice.concepto || concepto;

  const lineas = esNotaCredito
    ? [
        await buildLinea("ventasServicios", "debe", neto, descripcion),
        ...(iva > 0 ? [await buildLinea("ivaDebito", "debe", iva, "IVA debito fiscal")] : []),
        await buildLinea("clientes", "haber", total, invoice.cliente_nombre || "Cliente"),
      ]
    : [
        await buildLinea("clientes", "debe", total, invoice.cliente_nombre || "Cliente"),
        await buildLinea("ventasServicios", "haber", neto, descripcion),
        ...(iva > 0 ? [await buildLinea("ivaDebito", "haber", iva, "IVA debito fiscal")] : []),
      ];

  return crearAsientoSiNoExiste({
    fecha: dateOnly(invoice.emitted_at || invoice.created_at),
    concepto,
    origen: "arca_invoice",
    origenId: invoice.id,
    sedeId: invoice.sede_id || null,
    estado: "confirmado",
    lineas,
  });
}

export async function registrarAsientoIngresoCobrado(ingreso) {
  if (!ingreso?.id || !isPaid(ingreso.estado)) return null;

  const importe = toMoney(ingreso.importe);
  if (importe <= 0) return null;

  const cuentaFondos = getCuentaCajaOBancos(ingreso.cobro);

  return crearAsientoSiNoExiste({
    fecha: dateOnly(ingreso.fechaDb || ingreso.fecha),
    concepto: `Cobro ingreso: ${ingreso.concepto || ingreso.comprobante || ingreso.id}`,
    origen: "ingreso_cobro",
    origenId: ingreso.id,
    sedeId: ingreso.sedeId,
    estado: "confirmado",
    lineas: [
      await buildLinea(cuentaFondos, "debe", importe, ingreso.cobro || "Cobro"),
      await buildLinea("clientes", "haber", importe, ingreso.sociedad || ingreso.concepto || "Cliente"),
    ],
  });
}

export async function registrarAsientoEgresoCargado(egreso) {
  if (!egreso?.id) return null;

  const total = toMoney(egreso.importe);
  if (total <= 0) return null;

  if (egreso.totalesFiscales) {
    const fiscal = egreso.totalesFiscales;
    const gastoBase = toMoney(fiscal.netoGravado + fiscal.exento + fiscal.noGravado);
    const descripcionFiscal = egreso.concepto || egreso.proveedor || "Egreso";
    const lineas = [
      ...(gastoBase > 0 ? [await buildLinea(getCuentaEgresoPorCategoria(egreso.categoria), "debe", gastoBase, descripcionFiscal)] : []),
      ...(fiscal.iva > 0 ? [await buildLinea("ivaCredito", "debe", fiscal.iva, "IVA credito fiscal")] : []),
      ...(fiscal.percepciones > 0 ? [await buildLinea("percepcionesSufridas", "debe", fiscal.percepciones, "Percepciones sufridas")] : []),
      ...(fiscal.retenciones > 0 ? [await buildLinea("retencionesSufridas", "haber", fiscal.retenciones, "Retenciones sufridas")] : []),
      ...(fiscal.otrosTributos > 0 ? [await buildLinea("impuestosNoRecuperables", "debe", fiscal.otrosTributos, "Tributos no recuperables")] : []),
      await buildLinea("proveedores", "haber", total, egreso.proveedor || "Proveedor"),
    ];
    const debe = toMoney(lineas.reduce((acc, linea) => acc + linea.debe, 0));
    const haber = toMoney(lineas.reduce((acc, linea) => acc + linea.haber, 0));
    const diferencia = toMoney(haber - debe);

    if (diferencia > 0.01) {
      lineas.splice(lineas.length - 1, 0, await buildLinea(getCuentaEgresoPorCategoria(egreso.categoria), "debe", diferencia, "Ajuste fiscal del egreso"));
    } else if (diferencia < -0.01) {
      lineas.splice(lineas.length - 1, 0, await buildLinea(getCuentaEgresoPorCategoria(egreso.categoria), "haber", Math.abs(diferencia), "Ajuste fiscal del egreso"));
    }

    return crearAsientoSiNoExiste({
      fecha: dateOnly(egreso.fechaDb || egreso.fecha),
      concepto: `Egreso cargado: ${descripcionFiscal}`,
      origen: "egreso",
      origenId: egreso.id,
      sedeId: egreso.sedeId,
      estado: "confirmado",
      lineas,
    });
  }

  const iva = Math.min(
    total,
    Math.abs(
      getFiscalNumber(
        egreso.datosFiscales?.importeIva,
        egreso.datosFiscales?.iva,
        egreso.datosFiscales?.importe_iva,
      ),
    ),
  );
  const neto = toMoney(total - iva);
  const cuentaGasto = getCuentaEgresoPorCategoria(egreso.categoria);
  const descripcion = egreso.concepto || egreso.proveedor || "Egreso";

  return crearAsientoSiNoExiste({
    fecha: dateOnly(egreso.fechaDb || egreso.fecha),
    concepto: `Egreso cargado: ${descripcion}`,
    origen: "egreso",
    origenId: egreso.id,
    sedeId: egreso.sedeId,
    estado: "confirmado",
    lineas: [
      await buildLinea(cuentaGasto, "debe", neto || total, descripcion),
      ...(iva > 0 ? [await buildLinea("ivaCredito", "debe", iva, "IVA credito fiscal")] : []),
      await buildLinea("proveedores", "haber", total, egreso.proveedor || "Proveedor"),
    ],
  });
}

export async function registrarAsientoEgresoPagado(egreso) {
  if (!egreso?.id || !isPaid(egreso.estado)) return null;

  const importe = toMoney(egreso.importe);
  if (importe <= 0) return null;
  const medioPago = egreso.medioPago || egreso.medio_pago || egreso.datosFiscales?.medioPago || egreso.datos_fiscales?.medioPago || "";
  const cuentaPago = egreso.cuentaPago || egreso.cuenta_pago || egreso.datosFiscales?.cuentaPago || egreso.datos_fiscales?.cuentaPago || "";
  const cuentaFondos = getCuentaCajaOBancos(`${medioPago} ${cuentaPago}`);

  return crearAsientoSiNoExiste({
    fecha: dateOnly(egreso.fechaDb || egreso.fecha),
    concepto: `Pago egreso: ${egreso.concepto || egreso.proveedor || egreso.id}`,
    origen: "egreso_pago",
    origenId: egreso.id,
    sedeId: egreso.sedeId,
    estado: "confirmado",
    lineas: [
      await buildLinea("proveedores", "debe", importe, egreso.proveedor || "Proveedor"),
      await buildLinea(cuentaFondos, "haber", importe, cuentaPago || medioPago || "Pago"),
    ],
  });
}

export async function registrarAsientoConciliacionIngreso(movimiento, ingreso) {
  if (!movimiento?.id || !ingreso?.id) return null;

  if (await asientoContableExiste("ingreso_cobro", ingreso.id)) {
    return null;
  }

  const importe = toMoney(movimiento.importe || ingreso.importe);
  if (importe <= 0) return null;

  return crearAsientoSiNoExiste({
    fecha: dateOnly(movimiento.fechaDb || movimiento.fecha),
    concepto: `Conciliacion bancaria ingreso: ${ingreso.concepto || movimiento.descripcion || ingreso.id}`,
    origen: "conciliacion_ingreso",
    origenId: movimiento.id,
    sedeId: movimiento.sedeId || ingreso.sedeId,
    estado: "confirmado",
    lineas: [
      await buildLinea("bancos", "debe", importe, movimiento.cuenta || "Banco"),
      await buildLinea("clientes", "haber", importe, ingreso.sociedad || ingreso.concepto || "Cliente"),
    ],
  });
}

export async function registrarAsientoConciliacionEgreso(movimiento, egreso) {
  if (!movimiento?.id || !egreso?.id) return null;

  if (await asientoContableExiste("egreso_pago", egreso.id)) {
    return null;
  }

  const importe = Math.abs(toMoney(movimiento.importe || egreso.importe));
  if (importe <= 0) return null;

  return crearAsientoSiNoExiste({
    fecha: dateOnly(movimiento.fechaDb || movimiento.fecha),
    concepto: `Conciliacion bancaria egreso: ${egreso.concepto || movimiento.descripcion || egreso.id}`,
    origen: "conciliacion_egreso",
    origenId: movimiento.id,
    sedeId: movimiento.sedeId || egreso.sedeId,
    estado: "confirmado",
    lineas: [
      await buildLinea("proveedores", "debe", importe, egreso.proveedor || "Proveedor"),
      await buildLinea("bancos", "haber", importe, movimiento.cuenta || "Banco"),
    ],
  });
}
