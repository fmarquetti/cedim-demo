import { supabase } from "../lib/supabaseClient";

const CUENTAS_POR_DEFECTO = {
  caja: "1.1.01",
  bancos: "1.1.02",
  clientes: "1.1.03",
  proveedores: "2.1.01",
  ivaDebito: "2.1.02",
  ivaCredito: "2.1.03",
  ventasServicios: "4.1.01",
  compras: "5.1.01",
  gastosAdministrativos: "5.1.02",
  otrosIngresos: "4.1.02",
  otrosEgresos: "5.1.06",
};

function isDuplicateAsientoError(error) {
  return error?.code === "23505";
}

function toNumber(value) {
  return Number(value || 0);
}

function toMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

function getSedeId(sedeId) {
  if (!sedeId || sedeId === "todas") return null;
  if (typeof sedeId === "object") return sedeId.id || null;
  return sedeId;
}

function mapCuenta(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    tipo: row.tipo,
    subtipo: row.subtipo,
    cuentaPadreId: row.cuenta_padre_id,
    imputable: row.imputable,
    activa: row.activa,
  };
}

function mapLinea(row) {
  const cuenta = row.contabilidad_cuentas ? mapCuenta(row.contabilidad_cuentas) : null;

  return {
    id: row.id,
    asientoId: row.asiento_id,
    cuentaId: row.cuenta_id,
    cuenta,
    descripcion: row.descripcion,
    debe: toMoney(row.debe),
    haber: toMoney(row.haber),
  };
}

function mapAsiento(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    numero: row.numero,
    concepto: row.concepto,
    origen: row.origen,
    origenId: row.origen_id,
    sedeId: row.sede_id,
    estado: row.estado,
    lineas: (row.contabilidad_asiento_lineas || []).map(mapLinea),
  };
}

function validarLinea(linea, index) {
  if (!linea?.cuentaId) {
    throw new Error(`La linea ${index + 1} no tiene cuenta contable.`);
  }

  const debe = toMoney(linea.debe);
  const haber = toMoney(linea.haber);

  if (debe < 0 || haber < 0) {
    throw new Error(`La linea ${index + 1} no puede tener importes negativos.`);
  }

  if (debe > 0 && haber > 0) {
    throw new Error(`La linea ${index + 1} no puede tener debe y haber al mismo tiempo.`);
  }

  if (debe === 0 && haber === 0) {
    throw new Error(`La linea ${index + 1} debe tener importe en debe o haber.`);
  }
}

function validarAsiento(payload) {
  if (!payload?.fecha) throw new Error("La fecha del asiento es requerida.");
  if (!payload?.concepto) throw new Error("El concepto del asiento es requerido.");
  if (!payload?.origen) throw new Error("El origen del asiento es requerido.");

  const lineas = Array.isArray(payload.lineas) ? payload.lineas : [];

  if (lineas.length < 2) {
    throw new Error("El asiento debe tener al menos 2 lineas.");
  }

  lineas.forEach(validarLinea);

  const totalDebe = toMoney(lineas.reduce((acc, item) => acc + toNumber(item.debe), 0));
  const totalHaber = toMoney(lineas.reduce((acc, item) => acc + toNumber(item.haber), 0));

  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    throw new Error(`El asiento no balancea: debe ${totalDebe} y haber ${totalHaber}.`);
  }
}

export async function getCuentasContables() {
  const { data, error } = await supabase
    .from("contabilidad_cuentas")
    .select("*")
    .order("codigo", { ascending: true });

  if (error) throw error;

  return (data || []).map(mapCuenta);
}

export async function getAsientosContables({ desde, hasta, sedeId } = {}) {
  let query = supabase
    .from("contabilidad_asientos")
    .select(`
      *,
      contabilidad_asiento_lineas (
        *,
        contabilidad_cuentas (*)
      )
    `)
    .order("fecha", { ascending: true })
    .order("numero", { ascending: true });

  if (desde) {
    query = query.gte("fecha", desde);
  }

  if (hasta) {
    query = query.lte("fecha", hasta);
  }

  const idParaFiltro = getSedeId(sedeId);

  if (idParaFiltro) {
    query = query.eq("sede_id", idParaFiltro);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(mapAsiento);
}

export async function crearAsientoContable(payload) {
  validarAsiento(payload);

  const { data: asiento, error: asientoError } = await supabase
    .from("contabilidad_asientos")
    .insert({
      fecha: payload.fecha,
      concepto: payload.concepto,
      origen: payload.origen,
      origen_id: payload.origenId || null,
      sede_id: getSedeId(payload.sedeId),
      estado: payload.estado || "borrador",
      created_by: payload.createdBy || null,
    })
    .select("*")
    .single();

  if (asientoError) {
    if (isDuplicateAsientoError(asientoError)) {
      return null;
    }

    throw asientoError;
  }

  const lineas = payload.lineas.map((linea) => ({
    asiento_id: asiento.id,
    cuenta_id: linea.cuentaId,
    descripcion: linea.descripcion || null,
    debe: toMoney(linea.debe),
    haber: toMoney(linea.haber),
  }));

  const { error: lineasError } = await supabase
    .from("contabilidad_asiento_lineas")
    .insert(lineas);

  if (lineasError) {
    await supabase.from("contabilidad_asientos").delete().eq("id", asiento.id);
    throw lineasError;
  }

  const asientos = await getAsientosContables({
    desde: asiento.fecha,
    hasta: asiento.fecha,
    sedeId: asiento.sede_id,
  });

  return asientos.find((item) => item.id === asiento.id) || mapAsiento({
    ...asiento,
    contabilidad_asiento_lineas: [],
  });
}

export async function anularAsientoContable(id) {
  const { data, error } = await supabase
    .from("contabilidad_asientos")
    .update({
      estado: "anulado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  return mapAsiento({ ...data, contabilidad_asiento_lineas: [] });
}

export async function asientoContableExiste(origen, origenId) {
  if (!origen || !origenId) return false;

  const { data, error } = await supabase
    .from("contabilidad_asientos")
    .select("id")
    .eq("origen", origen)
    .eq("origen_id", origenId)
    .neq("estado", "anulado")
    .maybeSingle();

  if (error) throw error;

  return Boolean(data?.id);
}

export async function generarLibroDiario({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });

  return asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .flatMap((asiento) =>
      asiento.lineas.map((linea) => ({
        fecha: asiento.fecha,
        numero: asiento.numero,
        concepto: asiento.concepto,
        cuentaCodigo: linea.cuenta?.codigo || "",
        cuentaNombre: linea.cuenta?.nombre || "",
        descripcion: linea.descripcion,
        debe: linea.debe,
        haber: linea.haber,
        origen: asiento.origen,
      }))
    );
}

export async function generarLibroMayor({ desde, hasta, sedeId, cuentaId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });
  const grupos = new Map();

  asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .forEach((asiento) => {
      asiento.lineas
        .filter((linea) => !cuentaId || linea.cuentaId === cuentaId)
        .forEach((linea) => {
          const key = linea.cuentaId;

          if (!grupos.has(key)) {
            grupos.set(key, {
              cuentaId: linea.cuentaId,
              cuentaCodigo: linea.cuenta?.codigo || "",
              cuentaNombre: linea.cuenta?.nombre || "",
              movimientos: [],
              totalDebe: 0,
              totalHaber: 0,
              saldoFinal: 0,
            });
          }

          const grupo = grupos.get(key);
          grupo.totalDebe = toMoney(grupo.totalDebe + linea.debe);
          grupo.totalHaber = toMoney(grupo.totalHaber + linea.haber);
          grupo.saldoFinal = toMoney(grupo.saldoFinal + linea.debe - linea.haber);
          grupo.movimientos.push({
            fecha: asiento.fecha,
            numero: asiento.numero,
            concepto: asiento.concepto,
            descripcion: linea.descripcion,
            debe: linea.debe,
            haber: linea.haber,
            saldo: grupo.saldoFinal,
          });
        });
    });

  return Array.from(grupos.values()).sort((a, b) =>
    a.cuentaCodigo.localeCompare(b.cuentaCodigo)
  );
}

export async function generarBalanceSumasYSaldos({ desde, hasta, sedeId } = {}) {
  const asientos = await getAsientosContables({ desde, hasta, sedeId });
  const grupos = new Map();

  asientos
    .filter((asiento) => asiento.estado !== "anulado")
    .forEach((asiento) => {
      asiento.lineas.forEach((linea) => {
        const key = linea.cuentaId;

        if (!grupos.has(key)) {
          grupos.set(key, {
            cuentaCodigo: linea.cuenta?.codigo || "",
            cuentaNombre: linea.cuenta?.nombre || "",
            tipo: linea.cuenta?.tipo || "",
            sumaDebe: 0,
            sumaHaber: 0,
            saldoDeudor: 0,
            saldoAcreedor: 0,
          });
        }

        const grupo = grupos.get(key);
        grupo.sumaDebe = toMoney(grupo.sumaDebe + linea.debe);
        grupo.sumaHaber = toMoney(grupo.sumaHaber + linea.haber);

        const saldo = toMoney(grupo.sumaDebe - grupo.sumaHaber);
        grupo.saldoDeudor = saldo > 0 ? saldo : 0;
        grupo.saldoAcreedor = saldo < 0 ? Math.abs(saldo) : 0;
      });
    });

  return Array.from(grupos.values()).sort((a, b) =>
    a.cuentaCodigo.localeCompare(b.cuentaCodigo)
  );
}

export function mapearCuentaPorDefecto(tipo) {
  return CUENTAS_POR_DEFECTO[tipo] || null;
}
