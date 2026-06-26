import { supabase } from "../lib/supabaseClient";
import { getCuentasContables, guardarSaldosIniciales } from "./contabilidadService";
import { createEgreso } from "./egresoService";
import { createMovimientosBancariosBulk } from "./bancoService";
import { upsertEntidadCuentaCorriente } from "./cuentaCorrienteEntidadService";
import { registrarAuditoria } from "./auditoriaService";
import { parseDate, parseMoney } from "../utils/importUtils";
import { getDbSedeId } from "../utils/sedeUtils";

const money = (value) => Number(Number(value || 0).toFixed(2));
const clean = (value) => String(value || "").trim();

function result(errores, warnings, data, resumen = {}) {
  return { valid: errores.length === 0, errores, warnings, data, resumen };
}

function error(errores, rowIndex, campo, mensaje) {
  errores.push({ rowIndex, campo, mensaje });
}

async function auditarImportacion(tipo, resumen) {
  await registrarAuditoria({
    modulo: "Importaciones",
    accion: `importar_${tipo}`,
    entidad: "importacion",
    descripcion: `Se importó ${tipo}: ${resumen.importados || 0} importados, ${(resumen.errores || []).length} errores.`,
    metadata: {
      procesados: resumen.procesados ?? resumen.importados ?? 0,
      importados: resumen.importados || 0,
      errores: resumen.errores || [],
      fechas: resumen.fechas || [],
    },
  });
}

async function cuentasPorCodigo() {
  const cuentas = await getCuentasContables();
  return new Map((cuentas || []).map((cuenta) => [cuenta.codigo, cuenta]));
}

export async function validarImportacionSaldosIniciales(rows, { sedeId } = {}) {
  const errores = [];
  const map = await cuentasPorCodigo();
  const data = (rows || []).map((row, index) => {
    const rowIndex = index + 2;
    const fechaApertura = parseDate(row.fecha_apertura);
    const cuentaCodigo = clean(row.cuenta_codigo);
    const cuenta = map.get(cuentaCodigo);
    const debe = parseMoney(row.debe);
    const haber = parseMoney(row.haber);

    if (!fechaApertura) error(errores, rowIndex, "fecha_apertura", "Fecha invalida.");
    if (!cuentaCodigo) error(errores, rowIndex, "cuenta_codigo", "Cuenta requerida.");
    if (cuentaCodigo && !cuenta) error(errores, rowIndex, "cuenta_codigo", "La cuenta no existe.");
    if (debe < 0 || haber < 0) error(errores, rowIndex, "importe", "Debe y haber no pueden ser negativos.");
    if (debe > 0 && haber > 0) error(errores, rowIndex, "importe", "Debe informar debe o haber, no ambos.");
    if (debe === 0 && haber === 0) error(errores, rowIndex, "importe", "Debe informar un importe.");

    return {
      fechaApertura,
      cuentaId: cuenta?.id || "",
      cuentaCodigo,
      descripcion: clean(row.descripcion || row.cuenta_nombre),
      debe,
      haber,
    };
  });

  const totalDebe = money(data.reduce((acc, item) => acc + item.debe, 0));
  const totalHaber = money(data.reduce((acc, item) => acc + item.haber, 0));
  const diferencia = money(totalDebe - totalHaber);
  if (data.length < 2) error(errores, 0, "archivo", "Debe cargar al menos dos lineas.");
  if (Math.abs(diferencia) > 0.01) error(errores, 0, "totales", "El total debe debe ser igual al total haber.");

  void sedeId;
  return result(errores, [], data, { totalFilas: data.length, totalDebe, totalHaber, diferencia });
}

export async function importarSaldosIniciales(rows, { sedeId } = {}) {
  const validation = await validarImportacionSaldosIniciales(rows, { sedeId });
  if (!validation.valid) {
    const err = new Error("La importacion de saldos iniciales tiene errores.");
    err.detalle = validation.errores;
    throw err;
  }

  const grupos = new Map();
  validation.data.forEach((item) => {
    if (!grupos.has(item.fechaApertura)) grupos.set(item.fechaApertura, []);
    grupos.get(item.fechaApertura).push(item);
  });

  let importados = 0;
  const fechas = [];
  for (const [fechaApertura, lineas] of grupos.entries()) {
    await guardarSaldosIniciales({ fechaApertura, sedeId, lineas });
    importados += lineas.length;
    fechas.push(fechaApertura);
  }

  const resumen = { procesados: validation.data.length, importados, errores: [], fechas };
  await auditarImportacion("saldos_iniciales", resumen);
  return { importados, errores: [], fechas };
}

export function validarImportacionEgresos(rows, { sedeId } = {}) {
  const errores = [];
  const data = (rows || []).map((row, index) => {
    const rowIndex = index + 2;
    const fecha = parseDate(row.fecha);
    const importe = parseMoney(row.importe);
    const detalleFiscal = {
      netoGravado: parseMoney(row.neto_gravado ?? row.neto),
      iva: parseMoney(row.iva),
      exento: parseMoney(row.exento),
      noGravado: parseMoney(row.no_gravado),
      percepcionIva: parseMoney(row.percepcion_iva),
      percepcionIibb: parseMoney(row.percepcion_iibb),
      retencionGanancias: parseMoney(row.retencion_ganancias),
      retencionIva: parseMoney(row.retencion_iva),
      retencionIibb: parseMoney(row.retencion_iibb),
      otrosTributos: parseMoney(row.otros_tributos),
    };
    const form = {
      fecha,
      proveedor: clean(row.proveedor),
      sociedad: clean(row.sociedad) || "CEDIM",
      sedeId: getDbSedeId(sedeId) || "",
      concepto: clean(row.concepto),
      conceptosItems: [],
      categoria: clean(row.categoria) || "Insumos",
      importe,
      estado: clean(row.estado) || "Pendiente",
      comprobante: clean(row.comprobante) || null,
      datosFiscales: null,
      detalleFiscal,
    };

    if (row.factura_cuit || row.factura_tipo || row.factura_punto_venta || row.factura_numero) {
      form.facturaCuit = row.factura_cuit;
      form.facturaTipo = row.factura_tipo;
      form.facturaPuntoVenta = row.factura_punto_venta;
      form.facturaNumero = row.factura_numero;
      form.datosFiscales = {
        cuit: row.factura_cuit,
        tipoComprobante: row.factura_tipo,
        puntoVenta: row.factura_punto_venta,
        numeroComprobante: row.factura_numero,
        neto: parseMoney(row.neto),
        neto_gravado: detalleFiscal.netoGravado,
        iva: parseMoney(row.iva),
        exento: detalleFiscal.exento,
        no_gravado: detalleFiscal.noGravado,
        importe,
      };
    }

    if (!fecha) error(errores, rowIndex, "fecha", "Fecha invalida.");
    if (!form.proveedor) error(errores, rowIndex, "proveedor", "Proveedor requerido.");
    if (!form.concepto) error(errores, rowIndex, "concepto", "Concepto requerido.");
    if (importe <= 0) error(errores, rowIndex, "importe", "Importe debe ser mayor a cero.");
    if (Object.values(detalleFiscal).some((value) => value < 0)) {
      error(errores, rowIndex, "detalle_fiscal", "Los importes fiscales no pueden ser negativos.");
    }
    if (!form.sedeId) error(errores, rowIndex, "sede", "Debe seleccionar una sede concreta.");

    return form;
  });

  return result(errores, [], data, { totalFilas: data.length, totalImporte: money(data.reduce((acc, item) => acc + item.importe, 0)) });
}

export async function importarEgresos(rows, { sedeId } = {}) {
  const validation = validarImportacionEgresos(rows, { sedeId });
  if (!validation.valid) return { procesados: validation.data.length, importados: 0, errores: validation.errores };

  const errores = [];
  let importados = 0;
  for (const [index, form] of validation.data.entries()) {
    try {
      await createEgreso(form);
      importados += 1;
    } catch (err) {
      errores.push({ rowIndex: index + 2, mensaje: err.message || "No se pudo importar el egreso." });
    }
  }
  const resumen = { procesados: validation.data.length, importados, errores };
  await auditarImportacion("egresos", resumen);
  return resumen;
}

export function validarImportacionMovimientosBancarios(rows, { sedeId } = {}) {
  const errores = [];
  const data = (rows || []).map((row, index) => {
    const rowIndex = index + 2;
    const fecha = parseDate(row.fecha);
    const importe = parseMoney(row.importe);
    const item = {
      fecha,
      sedeId: getDbSedeId(sedeId),
      cuenta: clean(row.cuenta),
      tipo: clean(row.tipo),
      descripcion: clean(row.descripcion),
      importe,
      origen: clean(row.origen) || "Importacion bancaria",
      estado: clean(row.estado) || "Pendiente",
      externalHash: clean(row.external_hash) || null,
      metadata: { importado: true },
    };

    if (!fecha) error(errores, rowIndex, "fecha", "Fecha invalida.");
    if (!item.cuenta) error(errores, rowIndex, "cuenta", "Cuenta requerida.");
    if (!item.tipo) error(errores, rowIndex, "tipo", "Tipo requerido.");
    if (!item.descripcion) error(errores, rowIndex, "descripcion", "Descripcion requerida.");
    if (importe <= 0) error(errores, rowIndex, "importe", "Importe debe ser mayor a cero.");
    return item;
  });

  return result(errores, [], data, { totalFilas: data.length, totalImporte: money(data.reduce((acc, item) => acc + item.importe, 0)) });
}

export async function importarMovimientosBancarios(rows, { sedeId } = {}) {
  const validation = validarImportacionMovimientosBancarios(rows, { sedeId });
  if (!validation.valid) return { procesados: validation.data.length, importados: 0, errores: validation.errores };
  await createMovimientosBancariosBulk(validation.data);
  const resumen = { procesados: validation.data.length, importados: validation.data.length, errores: [] };
  await auditarImportacion("movimientos_bancarios", resumen);
  return resumen;
}

export function validarImportacionEntidades(rows) {
  const errores = [];
  const tipos = ["cliente", "proveedor", "ambos"];
  const data = (rows || []).map((row, index) => {
    const rowIndex = index + 2;
    const item = {
      tipo: clean(row.tipo).toLowerCase(),
      nombre: clean(row.nombre),
      documento: clean(row.documento).replace(/\D/g, ""),
      condicionIva: clean(row.condicion_iva),
      email: clean(row.email),
      telefono: clean(row.telefono),
      domicilio: clean(row.domicilio),
    };
    if (!tipos.includes(item.tipo)) error(errores, rowIndex, "tipo", "Tipo debe ser cliente, proveedor o ambos.");
    if (!item.nombre) error(errores, rowIndex, "nombre", "Nombre requerido.");
    if (item.documento && item.documento.length < 7) error(errores, rowIndex, "documento", "Documento invalido.");
    return item;
  });
  return result(errores, [], data, { totalFilas: data.length });
}

export async function importarEntidades(rows) {
  const validation = validarImportacionEntidades(rows);
  if (!validation.valid) return { procesados: validation.data.length, importados: 0, errores: validation.errores };

  const errores = [];
  let importados = 0;
  for (const [index, item] of validation.data.entries()) {
    const tipos = item.tipo === "ambos" ? ["cliente", "proveedor"] : [item.tipo];
    for (const tipo of tipos) {
      try {
        await upsertEntidadCuentaCorriente({ ...item, tipo });
        importados += 1;
      } catch (err) {
        errores.push({ rowIndex: index + 2, mensaje: err.message || "No se pudo importar la entidad." });
      }
    }
  }
  const resumen = { procesados: validation.data.length, importados, errores };
  await auditarImportacion("entidades", resumen);
  return resumen;
}

export function validarImportacionPlanCuentas(rows) {
  const errores = [];
  const tipos = ["ACTIVO", "PASIVO", "PATRIMONIO_NETO", "INGRESO", "EGRESO", "ORDEN"];
  const data = (rows || []).map((row, index) => {
    const rowIndex = index + 2;
    const item = {
      codigo: clean(row.codigo),
      nombre: clean(row.nombre),
      tipo: clean(row.tipo).toUpperCase(),
      subtipo: clean(row.subtipo) || null,
      imputable: !["false", "no", "0"].includes(clean(row.imputable).toLowerCase()),
      activa: !["false", "no", "0"].includes(clean(row.activa).toLowerCase()),
    };
    if (!item.codigo) error(errores, rowIndex, "codigo", "Codigo requerido.");
    if (!item.nombre) error(errores, rowIndex, "nombre", "Nombre requerido.");
    if (!tipos.includes(item.tipo)) error(errores, rowIndex, "tipo", "Tipo invalido.");
    return item;
  });
  return result(errores, [], data, { totalFilas: data.length });
}

export async function importarPlanCuentas(rows) {
  const validation = validarImportacionPlanCuentas(rows);
  if (!validation.valid) return { procesados: validation.data.length, importados: 0, errores: validation.errores };

  const { error: upsertError } = await supabase
    .from("contabilidad_cuentas")
    .upsert(validation.data.map((item) => ({
      codigo: item.codigo,
      nombre: item.nombre,
      tipo: item.tipo,
      subtipo: item.subtipo,
      imputable: item.imputable,
      activa: item.activa,
      updated_at: new Date().toISOString(),
    })), { onConflict: "codigo" });

  if (upsertError) throw upsertError;
  const resumen = { procesados: validation.data.length, importados: validation.data.length, errores: [] };
  await auditarImportacion("plan_cuentas", resumen);
  return resumen;
}
