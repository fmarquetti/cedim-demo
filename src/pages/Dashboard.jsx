// src/pages/Dashboard.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowDown,
  ArrowUpCircle,
  ArrowUp,
  Banknote,
  GripVertical,
  RefreshCw,
  TrendingUp,
  Wallet,
  Loader2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import StatCard from "../components/StatCard";
import DataTable from "../components/DataTable";

import { getIngresos } from "../services/ingresoService";
import { getEgresos } from "../services/egresoService";
import { getMovimientosBancarios } from "../services/bancoService";
import { getCuentasCorrientes } from "../services/cuentaCorrienteService";
import { getSedes } from "../services/sedeService";
import {
  getUserPreference,
  saveUserPreference,
} from "../services/userPreferenceService";

import { formatMoney } from "../utils/format";
import { getDbSedeId } from "../utils/sedeUtils";
import { loadSafeBatch } from "../utils/loadSafe";

// ─── HELPERS ───────────────────────────────────────────────────────────────

const toNumber = (value) => Number(value || 0);

const getSedeName = (item) => item?.sede || "Sin sede";
const getFechaReal = (item) => item?.fechaDb || item?.fecha;

const isPending = (estado) => {
  const value = String(estado || "").toLowerCase();
  return !["cobrado", "pagado", "aplicado", "conciliado"].includes(value);
};

const parseDate = (fecha) => {
  if (!fecha) return null;
  if (String(fecha).includes("/")) {
    const [dd, mm, yyyy] = fecha.split("/");
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }
  return new Date(`${String(fecha).split("T")[0]}T00:00:00`);
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
const startOfDay = (date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const endOfDay = (date) => { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; };

const monthLabel = (date) =>
  date.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });

// Calcula el rango [desde, hasta] según el período seleccionado
function calcularRangoPeriodo(periodo, fechaDesde, fechaHasta) {
  const hoy = new Date();
  const finMes = endOfMonth(hoy);

  switch (periodo) {
    case "mes":
      return { desde: startOfMonth(hoy), hasta: endOfDay(hoy) };
    case "3m": {
      const desde = startOfMonth(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1));
      return { desde, hasta: finMes };
    }
    case "6m": {
      const desde = startOfMonth(new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1));
      return { desde, hasta: finMes };
    }
    case "12m": {
      const desde = startOfMonth(new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1));
      return { desde, hasta: finMes };
    }
    case "anio":
      return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: endOfDay(hoy) };
    case "personalizado": {
      const desde = fechaDesde ? startOfDay(new Date(`${fechaDesde}T00:00:00`)) : null;
      const hasta = fechaHasta ? endOfDay(new Date(`${fechaHasta}T00:00:00`)) : null;
      return { desde, hasta };
    }
    default:
      return { desde: null, hasta: null };
  }
}

// Filtra items por rango de fechas (usa fechaDb / fecha)
function filtrarPorRango(items, desde, hasta) {
  if (!desde && !hasta) return items;
  return items.filter((item) => {
    const fecha = parseDate(getFechaReal(item));
    if (!fecha) return false;
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    return true;
  });
}

// Construye los buckets de meses entre desde y hasta
function buildMonths(desde, hasta) {
  const meses = [];
  const cursor = startOfMonth(desde);
  const fin = startOfMonth(hasta);
  while (cursor <= fin) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    meses.push({ key, periodo: monthLabel(cursor) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return meses;
}

// Vista actual: total ingresos vs total egresos por mes
function buildMonthlyChartData(ingresos, egresos, desde, hasta) {
  if (!desde || !hasta) return [];
  const meses = buildMonths(desde, hasta);
  const map = Object.fromEntries(
    meses.map((m) => [m.key, { periodo: m.periodo, ingresos: 0, egresos: 0, resultado: 0 }])
  );

  ingresos.forEach((item) => {
    const date = parseDate(getFechaReal(item));
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (map[key]) map[key].ingresos += toNumber(item.importe);
  });

  egresos.forEach((item) => {
    const date = parseDate(getFechaReal(item));
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (map[key]) map[key].egresos += toNumber(item.importe);
  });

  return meses.map((m) => {
    const b = map[m.key];
    return { ...b, resultado: b.ingresos - b.egresos };
  });
}

// Vista comparativa: una serie por sede para la métrica elegida
function buildComparativaPorSede(ingresos, egresos, sedes, desde, hasta, metrica) {
  if (!desde || !hasta) return { data: [], sedesActivas: [] };
  const meses = buildMonths(desde, hasta);

  // Inicializo cada mes con las sedes en 0
  const data = meses.map((m) => {
    const fila = { periodo: m.periodo, _key: m.key };
    sedes.forEach((sede) => {
      fila[`${sede}__ing`] = 0;
      fila[`${sede}__egr`] = 0;
    });
    return fila;
  });

  const indexByKey = Object.fromEntries(data.map((f) => [f._key, f]));

  ingresos.forEach((item) => {
    const date = parseDate(getFechaReal(item));
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const fila = indexByKey[key];
    const sede = getSedeName(item);
    if (fila && fila[`${sede}__ing`] !== undefined) {
      fila[`${sede}__ing`] += toNumber(item.importe);
    }
  });

  egresos.forEach((item) => {
    const date = parseDate(getFechaReal(item));
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const fila = indexByKey[key];
    const sede = getSedeName(item);
    if (fila && fila[`${sede}__egr`] !== undefined) {
      fila[`${sede}__egr`] += toNumber(item.importe);
    }
  });

  // Calculo la métrica final por sede
  const dataFinal = data.map((fila) => {
    const out = { periodo: fila.periodo };
    sedes.forEach((sede) => {
      const ing = fila[`${sede}__ing`] || 0;
      const egr = fila[`${sede}__egr`] || 0;
      if (metrica === "ingresos") out[sede] = ing;
      else if (metrica === "egresos") out[sede] = egr;
      else if (metrica === "resultado") out[sede] = ing - egr;
      else if (metrica === "rentabilidad") {
        out[sede] = ing > 0 ? Math.round(((ing - egr) / ing) * 100) : 0;
      }
    });
    return out;
  });

  // Solo dejamos sedes que tengan al menos un valor distinto de 0
  const sedesActivas = sedes.filter((sede) =>
    dataFinal.some((fila) => fila[sede] !== 0)
  );

  return { data: dataFinal, sedesActivas };
}

const COLORES_SEDES = [
  "#019cc5", "#3a73b9", "#3eb9b1", "#f4a261", "#e76f51",
  "#9b5de5", "#06d6a0", "#ef476f", "#ffd166", "#118ab2",
];

const getCuentaCorrienteImpacto = (item) => {
  const comprobantesDeuda = ["Factura", "Factura A", "Factura B", "Factura C", "Nota de Débito"];
  const sumaDeuda = comprobantesDeuda.includes(item.comprobante);
  return sumaDeuda ? toNumber(item.importe) : -toNumber(item.importe);
};

const LABELS_METRICA = {
  ingresos: "Ingresos",
  egresos: "Egresos",
  resultado: "Resultado",
  rentabilidad: "Rentabilidad %",
};

const DASHBOARD_WIDGETS_STORAGE_PREFIX = "cedim_dashboard_widgets_order";
const DASHBOARD_WIDGETS_PREFERENCE_KEY = "dashboard_widgets_order";

const DEFAULT_DASHBOARD_WIDGET_ORDER = [
  "kpi-ingresos",
  "kpi-egresos",
  "kpi-resultado",
  "kpi-caja-bancaria",
  "kpi-a-cobrar",
  "kpi-a-pagar",
  "kpi-deuda-vencida",
  "kpi-sin-conciliar",
  "chart-ingresos-egresos",
  "chart-resultado-sede",
  "chart-resultado-mensual",
  "chart-caja-cuenta",
  "table-resumen-sede",
  "panel-alertas",
  "table-saldos-bancarios",
];

const getDashboardWidgetsStorageKey = (currentUser) => {
  const email = String(currentUser?.email || "anonimo").trim().toLowerCase();
  return `${DASHBOARD_WIDGETS_STORAGE_PREFIX}_${email || "anonimo"}`;
};

const mergeWidgetOrder = (savedOrder, defaultOrder = DEFAULT_DASHBOARD_WIDGET_ORDER) => {
  const savedIds = Array.isArray(savedOrder) ? savedOrder : [];
  const validIds = new Set(defaultOrder);
  const orderedKnownIds = savedIds.filter((id) => validIds.has(id));
  const newDefaultIds = defaultOrder.filter((id) => !orderedKnownIds.includes(id));
  return [...orderedKnownIds, ...newDefaultIds];
};

const getWidgetOrderFromPreference = (preferenceValue) => {
  if (Array.isArray(preferenceValue)) return preferenceValue;
  if (Array.isArray(preferenceValue?.order)) return preferenceValue.order;
  return null;
};

const moveWidget = (order, sourceId, targetId) => {
  if (!sourceId || !targetId || sourceId === targetId) return order;

  const fromIndex = order.indexOf(sourceId);
  const toIndex = order.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) return order;

  const nextOrder = [...order];
  const [moved] = nextOrder.splice(fromIndex, 1);
  nextOrder.splice(toIndex, 0, moved);
  return nextOrder;
};

const isInteractiveDragTarget = (target) =>
  target?.closest?.("button, input, select, textarea, a, [role='button']");

const useMediaQuery = (query) => {
  const getMatches = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;

    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, [query]);

  return matches;
};

const getInitialWidgetOrder = (currentUser) => {
  try {
    const rawOrder = localStorage.getItem(getDashboardWidgetsStorageKey(currentUser));
    return mergeWidgetOrder(rawOrder ? JSON.parse(rawOrder) : null);
  } catch (err) {
    console.warn("No se pudo leer el orden de widgets del dashboard:", err);
    return DEFAULT_DASHBOARD_WIDGET_ORDER;
  }
};

// ─── COMPONENTE ────────────────────────────────────────────────────────────

export default function Dashboard({ sedeId, dbSedeId, currentUser }) {
  const widgetsStorageKey = getDashboardWidgetsStorageKey(currentUser);
  const [ingresos, setIngresos] = useState([]);
  const [egresos, setEgresos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cuentasCorrientes, setCuentasCorrientes] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadWarnings, setLoadWarnings] = useState([]);
  const [widgetOrder, setWidgetOrder] = useState(() => getInitialWidgetOrder(currentUser));
  const [draggedWidgetId, setDraggedWidgetId] = useState("");
  const [dragOverWidgetId, setDragOverWidgetId] = useState("");
  const isMobileWidgetOrdering = useMediaQuery("(max-width: 800px), (pointer: coarse)");
  const isWidgetDragEnabled = !isMobileWidgetOrdering;

  // Filtros de período
  const [periodo, setPeriodo] = useState("6m");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Toggle vista comparativa
  const [vistaComparativa, setVistaComparativa] = useState(false);
  const [metricaComparativa, setMetricaComparativa] = useState("ingresos");

  const effectiveDbSedeId = dbSedeId ?? getDbSedeId(sedeId);
  const verTodasSedes = !effectiveDbSedeId;

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setLoadWarnings([]);

      const results = await loadSafeBatch({
        ingresos: {
          label: "ingresos del dashboard",
          promise: getIngresos(effectiveDbSedeId),
          fallback: [],
        },
        egresos: {
          label: "egresos del dashboard",
          promise: getEgresos(effectiveDbSedeId),
          fallback: [],
        },
        movimientos: {
          label: "movimientos bancarios del dashboard",
          promise: getMovimientosBancarios(effectiveDbSedeId),
          fallback: [],
        },
        cuentasCorrientes: {
          label: "cuentas corrientes del dashboard",
          promise: getCuentasCorrientes(effectiveDbSedeId),
          fallback: [],
        },
        sedes: {
          label: "sedes del dashboard",
          promise: getSedes(),
          fallback: [],
        },
      });

      setIngresos(results.ingresos.data || []);
      setEgresos(results.egresos.data || []);
      setMovimientos(results.movimientos.data || []);
      setCuentasCorrientes(results.cuentasCorrientes.data || []);
      setSedes(results.sedes.data || []);
      setLoadWarnings(
        Object.entries(results)
          .filter(([, result]) => result.error)
          .map(([label, result]) => ({
            label,
            message: result.error?.message || "Error desconocido",
          }))
      );
    } catch (err) {
      console.error("Error cargando dashboard:", err);
      setError("No se pudo cargar la información del dashboard.");
    } finally {
      setLoading(false);
    }
  }, [effectiveDbSedeId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDashboard();
    });
  }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;

    async function loadWidgetOrderPreference() {
      if (!currentUser?.id) return;

      try {
        const preferenceValue = await getUserPreference(
          currentUser.id,
          DASHBOARD_WIDGETS_PREFERENCE_KEY
        );
        const remoteOrder = getWidgetOrderFromPreference(preferenceValue);

        if (!cancelled && remoteOrder) {
          const nextOrder = mergeWidgetOrder(remoteOrder);
          setWidgetOrder(nextOrder);

          try {
            localStorage.setItem(widgetsStorageKey, JSON.stringify(nextOrder));
          } catch (storageError) {
            console.warn("No se pudo sincronizar el orden local del dashboard:", storageError);
          }
        }
      } catch (err) {
        console.warn("No se pudo cargar la preferencia de widgets del dashboard:", err);
      }
    }

    loadWidgetOrderPreference();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, widgetsStorageKey]);

  // Si la sede cambia y deja de ser "todas", apagamos la vista comparativa
  useEffect(() => {
    if (!verTodasSedes) {
      queueMicrotask(() => setVistaComparativa(false));
    }
  }, [verTodasSedes]);

  useEffect(() => {
    if (isMobileWidgetOrdering) {
      queueMicrotask(() => {
        setDraggedWidgetId("");
        setDragOverWidgetId("");
      });
    }
  }, [isMobileWidgetOrdering]);

  // ─── Rango del período ─────────────────────────────────────────────────
  const { desde, hasta } = useMemo(
    () => calcularRangoPeriodo(periodo, fechaDesde, fechaHasta),
    [periodo, fechaDesde, fechaHasta]
  );

  // ─── Datos filtrados por período ───────────────────────────────────────
  const ingresosFiltrados = useMemo(
    () => filtrarPorRango(ingresos, desde, hasta),
    [ingresos, desde, hasta]
  );

  const egresosFiltrados = useMemo(
    () => filtrarPorRango(egresos, desde, hasta),
    [egresos, desde, hasta]
  );

  const movimientosFiltrados = useMemo(
    () => filtrarPorRango(movimientos, desde, hasta),
    [movimientos, desde, hasta]
  );

  // Cuentas corrientes NO se filtran por período (son saldos vivos)
  const cuentasFiltradas = cuentasCorrientes;

  // ─── Métricas principales ──────────────────────────────────────────────
  const totalIngresos = useMemo(
    () => ingresosFiltrados.reduce((acc, item) => acc + toNumber(item.importe), 0),
    [ingresosFiltrados]
  );

  const totalEgresos = useMemo(
    () => egresosFiltrados.reduce((acc, item) => acc + toNumber(item.importe), 0),
    [egresosFiltrados]
  );

  const resultado = totalIngresos - totalEgresos;

  const cajaBancos = useMemo(
    () =>
      movimientosFiltrados.reduce((acc, item) => {
        return item.tipo === "Egreso"
          ? acc - toNumber(item.importe)
          : acc + toNumber(item.importe);
      }, 0),
    [movimientosFiltrados]
  );

  const aCobrar = useMemo(
    () =>
      cuentasFiltradas
        .filter((item) => item.tipoEntidad !== "Proveedor")
        .filter((item) => isPending(item.estado))
        .reduce((acc, item) => acc + Math.max(0, getCuentaCorrienteImpacto(item)), 0),
    [cuentasFiltradas]
  );

  const aPagar = useMemo(
    () =>
      cuentasFiltradas
        .filter((item) => item.tipoEntidad === "Proveedor")
        .filter((item) => isPending(item.estado))
        .reduce((acc, item) => acc + Math.max(0, getCuentaCorrienteImpacto(item)), 0),
    [cuentasFiltradas]
  );

  const cuentasVencidas = useMemo(() => {
    const hoy = startOfDay(new Date());
    return cuentasFiltradas.filter((item) => {
      if (!item.vencimiento || !isPending(item.estado)) return false;
      // Sólo cuentan los comprobantes que generan deuda (no notas de crédito)
      if (getCuentaCorrienteImpacto(item) <= 0) return false;
      const vencimiento = parseDate(item.vencimiento);
      return vencimiento && vencimiento < hoy;
    });
  }, [cuentasFiltradas]);

  const deudaVencida = cuentasVencidas.reduce(
    (acc, item) => acc + getCuentaCorrienteImpacto(item), 0
  );

  const conciliacionesPendientes = movimientosFiltrados.filter((item) =>
    isPending(item.estado)
  );

  // ─── Datos para el gráfico ─────────────────────────────────────────────
  const chartData = useMemo(
    () => buildMonthlyChartData(ingresosFiltrados, egresosFiltrados, desde, hasta),
    [ingresosFiltrados, egresosFiltrados, desde, hasta]
  );

  // Nombres de sedes disponibles para la comparativa
  const nombresSedes = useMemo(() => {
    const set = new Set();
    ingresos.forEach((item) => set.add(getSedeName(item)));
    egresos.forEach((item) => set.add(getSedeName(item)));
    sedes.forEach((sede) => sede?.nombre && set.add(sede.nombre));
    return Array.from(set).filter((n) => n && n !== "Sin sede").sort();
  }, [ingresos, egresos, sedes]);

  const comparativa = useMemo(
    () =>
      buildComparativaPorSede(
        ingresosFiltrados,
        egresosFiltrados,
        nombresSedes,
        desde,
        hasta,
        metricaComparativa
      ),
    [ingresosFiltrados, egresosFiltrados, nombresSedes, desde, hasta, metricaComparativa]
  );

  // ─── Resumen por sede ─────────────────────────────────────────────────
  const sedesResumen = useMemo(() => {
    const map = {};

    ingresosFiltrados.forEach((item) => {
      const sede = getSedeName(item);
      if (!map[sede]) map[sede] = { sede, ingresos: 0, egresos: 0, resultado: 0 };
      map[sede].ingresos += toNumber(item.importe);
    });

    egresosFiltrados.forEach((item) => {
      const sede = getSedeName(item);
      if (!map[sede]) map[sede] = { sede, ingresos: 0, egresos: 0, resultado: 0 };
      map[sede].egresos += toNumber(item.importe);
    });

    return Object.values(map)
      .map((item) => ({ ...item, resultado: item.ingresos - item.egresos }))
      .sort((a, b) => b.resultado - a.resultado);
  }, [ingresosFiltrados, egresosFiltrados]);

  const bancosPorCuenta = useMemo(() => {
    const map = {};
    movimientosFiltrados.forEach((item) => {
      if (!map[item.cuenta]) map[item.cuenta] = { cuenta: item.cuenta, saldo: 0, pendientes: 0 };
      map[item.cuenta].saldo +=
        item.tipo === "Egreso" ? -toNumber(item.importe) : toNumber(item.importe);
      if (isPending(item.estado)) map[item.cuenta].pendientes += 1;
    });
    return Object.values(map).sort((a, b) => b.saldo - a.saldo);
  }, [movimientosFiltrados]);

  const rows = sedesResumen.map((item) => ({
    sede: item.sede,
    ingresos: formatMoney(item.ingresos),
    egresos: formatMoney(item.egresos),
    resultado: formatMoney(item.resultado),
    rentabilidad:
      item.ingresos > 0
        ? `${Math.round((item.resultado / item.ingresos) * 100)}%`
        : "0%",
  }));

  const bancosRows = bancosPorCuenta.map((item) => ({
    cuenta: item.cuenta,
    saldo: formatMoney(item.saldo),
    pendientes: item.pendientes,
  }));

  // Formatters dinámicos según métrica
  const esRentabilidad = vistaComparativa && metricaComparativa === "rentabilidad";

  const tickFormatterY = (value) =>
    esRentabilidad
      ? `${Number(value)}%`
      : `$${Math.round(Number(value) / 1000)}k`;

  const tooltipFormatter = (value) =>
    esRentabilidad ? `${Number(value)}%` : formatMoney(value);

  // Etiqueta legible del período
  const labelPeriodo = useMemo(() => {
    const fmt = (d) =>
      d ? d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
    if (!desde || !hasta) return "Sin rango definido";
    return `${fmt(desde)} → ${fmt(hasta)}`;
  }, [desde, hasta]);

  const persistWidgetOrder = async (nextOrder) => {
    try {
      localStorage.setItem(widgetsStorageKey, JSON.stringify(nextOrder));
    } catch (err) {
      console.warn("No se pudo guardar el orden de widgets del dashboard:", err);
    }

    if (!currentUser?.id) return;

    try {
      await saveUserPreference(
        currentUser.id,
        DASHBOARD_WIDGETS_PREFERENCE_KEY,
        { order: nextOrder }
      );
    } catch (err) {
      console.warn("No se pudo guardar la preferencia de widgets del dashboard:", err);
    }
  };

  const resetWidgetDragState = () => {
    setDraggedWidgetId("");
    setDragOverWidgetId("");
  };

  const handleMobileWidgetMove = (widgetId, direction) => {
    const normalizedOrder = mergeWidgetOrder(widgetOrder);
    const currentIndex = normalizedOrder.indexOf(widgetId);
    const targetWidgetId = normalizedOrder[currentIndex + direction];

    if (currentIndex === -1 || !targetWidgetId) return;

    const nextOrder = moveWidget(normalizedOrder, widgetId, targetWidgetId);
    setWidgetOrder(nextOrder);
    void persistWidgetOrder(nextOrder);
  };

  const handleWidgetDragStart = (event, widgetId) => {
    if (!isWidgetDragEnabled || isInteractiveDragTarget(event.target)) {
      event.preventDefault();
      resetWidgetDragState();
      return;
    }

    setDraggedWidgetId(widgetId);
    setDragOverWidgetId("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", widgetId);
  };

  const handleWidgetDragOver = (event, widgetId) => {
    if (!isWidgetDragEnabled) {
      resetWidgetDragState();
      return;
    }

    event.preventDefault();
    if (widgetId !== dragOverWidgetId) setDragOverWidgetId(widgetId);
    event.dataTransfer.dropEffect = "move";
  };

  const handleWidgetDrop = (event, targetWidgetId) => {
    if (!isWidgetDragEnabled) {
      resetWidgetDragState();
      return;
    }

    event.preventDefault();
    const sourceWidgetId = event.dataTransfer.getData("text/plain") || draggedWidgetId;

    const normalizedOrder = mergeWidgetOrder(widgetOrder);
    const nextOrder = moveWidget(normalizedOrder, sourceWidgetId, targetWidgetId);
    setWidgetOrder(nextOrder);
    void persistWidgetOrder(nextOrder);

    resetWidgetDragState();
  };

  const handleWidgetDragEnd = () => {
    resetWidgetDragState();
  };

  if (loading) {
    return (
      <section className="page">
        <div className="dashboard-loader">
          <Loader2 className="dashboard-loader-icon" size={46} />
          <h3>Cargando dashboard financiero</h3>
          <p>Estamos consultando la información de ingresos, egresos, bancos y cuentas corrientes.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <div className="page-header" data-tour="dashboard-header">
          <div>
            <h2>Dashboard principal</h2>
            <p>{error}</p>
          </div>
          <button className="secondary-button" onClick={loadDashboard}>
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      </section>
    );
  }

  const dashboardWidgetsById = {
    "kpi-ingresos": {
      className: "dashboard-widget--stat",
      dataTour: "dashboard-kpis",
      content: (
        <StatCard
          title="Ingresos"
          value={formatMoney(totalIngresos)}
          detail={`${ingresosFiltrados.length} registros`}
          icon={<ArrowDownCircle size={22} />}
          dataTour="dashboard-kpi-ingresos"
        />
      ),
    },
    "kpi-egresos": {
      className: "dashboard-widget--stat",
      content: (
        <StatCard
          title="Egresos"
          value={formatMoney(totalEgresos)}
          detail={`${egresosFiltrados.length} registros`}
          icon={<ArrowUpCircle size={22} />}
          dataTour="dashboard-kpi-egresos"
        />
      ),
    },
    "kpi-resultado": {
      className: "dashboard-widget--stat",
      content: (
        <StatCard
          title="Resultado"
          value={formatMoney(resultado)}
          detail={resultado >= 0 ? "Resultado positivo" : "Resultado negativo"}
          icon={<TrendingUp size={22} />}
        />
      ),
    },
    "kpi-caja-bancaria": {
      className: "dashboard-widget--stat",
      content: (
        <StatCard
          title="Caja bancaria"
          value={formatMoney(cajaBancos)}
          detail={`${movimientosFiltrados.length} movimientos`}
          icon={<Wallet size={22} />}
          dataTour="dashboard-kpi-pendientes"
        />
      ),
    },
    "kpi-a-cobrar": {
      className: "dashboard-widget--stat",
      content: (
        <StatCard
          title="A cobrar"
          value={formatMoney(aCobrar)}
          detail="Cuentas corrientes pendientes"
          icon={<Banknote size={22} />}
        />
      ),
    },
    "kpi-a-pagar": {
      className: "dashboard-widget--stat",
      content: (
        <StatCard
          title="A pagar"
          value={formatMoney(aPagar)}
          detail="Proveedores pendientes"
          icon={<Banknote size={22} />}
        />
      ),
    },
    "kpi-deuda-vencida": {
      className: "dashboard-widget--stat",
      content: (
        <StatCard
          title="Deuda vencida"
          value={formatMoney(deudaVencida)}
          detail={`${cuentasVencidas.length} comprobantes vencidos`}
          icon={<AlertTriangle size={22} />}
        />
      ),
    },
    "kpi-sin-conciliar": {
      className: "dashboard-widget--stat",
      content: (
        <StatCard
          title="Sin conciliar"
          value={conciliacionesPendientes.length}
          detail="Movimientos bancarios pendientes"
          icon={<AlertTriangle size={22} />}
          dataTour="dashboard-kpi-turnos"
        />
      ),
    },
    "chart-ingresos-egresos": {
      className: "dashboard-widget--large",
      dataTour: "dashboard-graficos",
      content: (
        <div className="panel">
          <div className="panel-toolbar">
            <h3 className="panel-toolbar-title">
              {vistaComparativa
                ? `Comparativa por sede - ${LABELS_METRICA[metricaComparativa]}`
                : "Ingresos vs egresos"}
            </h3>
            <div className="panel-toolbar-controls">
              {vistaComparativa && (
                <select
                  value={metricaComparativa}
                  onChange={(e) => setMetricaComparativa(e.target.value)}
                  className="mini-select"
                >
                  <option value="ingresos">Ingresos</option>
                  <option value="egresos">Egresos</option>
                  <option value="resultado">Resultado</option>
                  <option value="rentabilidad">Rentabilidad %</option>
                </select>
              )}
              {verTodasSedes && (
                <button
                  className="secondary-button"
                  onClick={() => setVistaComparativa((v) => !v)}
                  title={vistaComparativa ? "Ver ingresos vs egresos" : "Comparar por sede"}
                >
                  {vistaComparativa ? "Vista total" : "Comparar sedes"}
                </button>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            {vistaComparativa ? (
              <LineChart data={comparativa.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" />
                <YAxis tickFormatter={tickFormatterY} />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                {comparativa.sedesActivas.map((sede, i) => (
                  <Line
                    key={sede}
                    type="monotone"
                    dataKey={sede}
                    stroke={COLORES_SEDES[i % COLORES_SEDES.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" />
                <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Legend />
                <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#047f9d" strokeWidth={3} />
                <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#255f9f" strokeWidth={3} />
              </LineChart>
            )}
          </ResponsiveContainer>

          {vistaComparativa && comparativa.sedesActivas.length === 0 && (
            <p className="dashboard-chart-empty">
              No hay datos por sede en el periodo seleccionado.
            </p>
          )}
        </div>
      ),
    },
    "chart-resultado-sede": {
      className: "dashboard-widget--large",
      content: (
        <div className="panel">
          <h3>Resultado por sede</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sedesResumen}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sede" />
              <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="resultado" fill="#2caaa2" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ),
    },
    "chart-resultado-mensual": {
      className: "dashboard-widget--large",
      content: (
        <div className="panel">
          <h3>Resultado mensual</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="resultado" fill="#047f9d" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ),
    },
    "chart-caja-cuenta": {
      className: "dashboard-widget--large",
      content: (
        <div className="panel">
          <h3>Caja por cuenta</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bancosPorCuenta}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cuenta" />
              <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="saldo" fill="#255f9f" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ),
    },
    "table-resumen-sede": {
      className: "dashboard-widget--wide",
      dataTour: "dashboard-actividad",
      content: (
        <div className="panel wide">
          <h3>Resumen por sede</h3>
          <DataTable
            columns={["Sede", "Ingresos", "Egresos", "Resultado", "Rentabilidad"]}
            rows={rows}
          />
        </div>
      ),
    },
    "panel-alertas": {
      className: "dashboard-widget--large",
      content: (
        <div className="panel">
          <h3>Alertas</h3>
          <div className="alert-item danger">
            <strong>{cuentasVencidas.length} cuentas vencidas</strong>
            <span>Total: {formatMoney(deudaVencida)}</span>
          </div>
          <div className="alert-item warning">
            <strong>{conciliacionesPendientes.length} movimientos sin conciliar</strong>
            <span>Requieren revision bancaria</span>
          </div>
          <div className="alert-item info">
            <strong>{cuentasFiltradas.length} registros en cuentas corrientes</strong>
            <span>Control operativo general</span>
          </div>
        </div>
      ),
    },
    "table-saldos-bancarios": {
      className: "dashboard-widget--wide",
      content: (
        <div className="panel">
          <h3>Saldos bancarios por cuenta</h3>
          <DataTable columns={["Cuenta", "Saldo", "Pendientes"]} rows={bancosRows} />
        </div>
      ),
    },
  };

  const orderedDashboardWidgets = mergeWidgetOrder(widgetOrder)
    .map((id) => ({ id, ...dashboardWidgetsById[id] }))
    .filter((widget) => widget.content);
  const showLegacyDashboard = window.__CEDIM_SHOW_LEGACY_DASHBOARD__ === true;

  return (
    <section className="page">
      <div className="page-header" data-tour="dashboard-header">
        <div>
          <h2>Dashboard principal</h2>
          <p>Resumen financiero y operativo · {labelPeriodo}</p>
        </div>
        <button className="secondary-button" onClick={loadDashboard}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {/* ── Filtros de período ── */}
      {loadWarnings.length > 0 && (
        <div className="empty-state">
          Algunos datos no pudieron cargarse.{" "}
          {loadWarnings
            .map((warning) => `${warning.label}: ${warning.message}`)
            .join(" | ")}
        </div>
      )}

      <div className="filters-bar dashboard-filters">
        <label className="filter-field">
          <span>Período</span>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="mes">Este mes</option>
            <option value="3m">Últimos 3 meses</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="12m">Últimos 12 meses</option>
            <option value="anio">Año actual</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </label>

        {periodo === "personalizado" && (
          <>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              title="Desde"
            />
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              title="Hasta"
            />
          </>
        )}
      </div>

      <div className="dashboard-widgets-grid">
        {orderedDashboardWidgets.map((widget, index) => (
          <div
            key={widget.id}
            className={[
              "dashboard-widget",
              widget.className,
              draggedWidgetId === widget.id ? "is-dragging" : "",
              dragOverWidgetId === widget.id && draggedWidgetId !== widget.id ? "is-drag-over" : "",
            ].filter(Boolean).join(" ")}
            data-widget-id={widget.id}
            data-tour={widget.dataTour}
            draggable={isWidgetDragEnabled}
            onDragStart={isWidgetDragEnabled ? (event) => handleWidgetDragStart(event, widget.id) : undefined}
            onDragOver={isWidgetDragEnabled ? (event) => handleWidgetDragOver(event, widget.id) : undefined}
            onDrop={isWidgetDragEnabled ? (event) => handleWidgetDrop(event, widget.id) : undefined}
            onDragEnd={isWidgetDragEnabled ? handleWidgetDragEnd : undefined}
          >
            {isWidgetDragEnabled ? (
              <div className="dashboard-widget-drag-handle" title="Arrastrar para reordenar">
                <GripVertical size={16} />
              </div>
            ) : (
              <div className="dashboard-widget-mobile-order" aria-label="Ordenar widget">
                <button
                  type="button"
                  onClick={() => handleMobileWidgetMove(widget.id, -1)}
                  disabled={index === 0}
                  aria-label="Mover widget arriba"
                  title="Mover arriba"
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMobileWidgetMove(widget.id, 1)}
                  disabled={index === orderedDashboardWidgets.length - 1}
                  aria-label="Mover widget abajo"
                  title="Mover abajo"
                >
                  <ArrowDown size={15} />
                </button>
              </div>
            )}
            {widget.content}
          </div>
        ))}
      </div>

      {showLegacyDashboard && (
      <>
      <div className="stats-grid" data-tour="dashboard-kpis">
        <StatCard
          title="Ingresos"
          value={formatMoney(totalIngresos)}
          detail={`${ingresosFiltrados.length} registros`}
          icon={<ArrowDownCircle size={22} />}
          dataTour="dashboard-kpi-ingresos"
        />
        <StatCard
          title="Egresos"
          value={formatMoney(totalEgresos)}
          detail={`${egresosFiltrados.length} registros`}
          icon={<ArrowUpCircle size={22} />}
          dataTour="dashboard-kpi-egresos"
        />
        <StatCard
          title="Resultado"
          value={formatMoney(resultado)}
          detail={resultado >= 0 ? "Resultado positivo" : "Resultado negativo"}
          icon={<TrendingUp size={22} />}
        />
        <StatCard
          title="Caja bancaria"
          value={formatMoney(cajaBancos)}
          detail={`${movimientosFiltrados.length} movimientos`}
          icon={<Wallet size={22} />}
          dataTour="dashboard-kpi-pendientes"
        />
        <StatCard
          title="A cobrar"
          value={formatMoney(aCobrar)}
          detail="Cuentas corrientes pendientes"
          icon={<Banknote size={22} />}
        />
        <StatCard
          title="A pagar"
          value={formatMoney(aPagar)}
          detail="Proveedores pendientes"
          icon={<Banknote size={22} />}
        />
        <StatCard
          title="Deuda vencida"
          value={formatMoney(deudaVencida)}
          detail={`${cuentasVencidas.length} comprobantes vencidos`}
          icon={<AlertTriangle size={22} />}
        />
        <StatCard
          title="Sin conciliar"
          value={conciliacionesPendientes.length}
          detail="Movimientos bancarios pendientes"
          icon={<AlertTriangle size={22} />}
          dataTour="dashboard-kpi-turnos"
        />
      </div>

      <div className="charts-grid" data-tour="dashboard-graficos">
        <div className="panel">
          <div className="panel-toolbar">
            <h3 className="panel-toolbar-title">
              {vistaComparativa
                ? `Comparativa por sede · ${LABELS_METRICA[metricaComparativa]}`
                : "Ingresos vs egresos"}
            </h3>
            <div className="panel-toolbar-controls">
              {vistaComparativa && (
                <select
                  value={metricaComparativa}
                  onChange={(e) => setMetricaComparativa(e.target.value)}
                  className="mini-select"
                >
                  <option value="ingresos">Ingresos</option>
                  <option value="egresos">Egresos</option>
                  <option value="resultado">Resultado</option>
                  <option value="rentabilidad">Rentabilidad %</option>
                </select>
              )}
              {verTodasSedes && (
                <button
                  className="secondary-button"
                  onClick={() => setVistaComparativa((v) => !v)}
                  title={vistaComparativa ? "Ver ingresos vs egresos" : "Comparar por sede"}
                >
                  {vistaComparativa ? "Vista total" : "Comparar sedes"}
                </button>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            {vistaComparativa ? (
              <LineChart data={comparativa.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" />
                <YAxis tickFormatter={tickFormatterY} />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                {comparativa.sedesActivas.map((sede, i) => (
                  <Line
                    key={sede}
                    type="monotone"
                    dataKey={sede}
                    stroke={COLORES_SEDES[i % COLORES_SEDES.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" />
                <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Legend />
                <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#047f9d" strokeWidth={3} />
                <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#255f9f" strokeWidth={3} />
              </LineChart>
            )}
          </ResponsiveContainer>

          {vistaComparativa && comparativa.sedesActivas.length === 0 && (
            <p className="dashboard-chart-empty">
              No hay datos por sede en el periodo seleccionado.
            </p>
          )}
        </div>

        <div className="panel">
          <h3>Resultado por sede</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sedesResumen}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sede" />
              <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="resultado" fill="#2caaa2" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-grid">
        <div className="panel">
          <h3>Resultado mensual</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="resultado" fill="#047f9d" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Caja por cuenta</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bancosPorCuenta}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cuenta" />
              <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="saldo" fill="#255f9f" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="content-grid" data-tour="dashboard-actividad">
        <div className="panel wide">
          <h3>Resumen por sede</h3>
          <DataTable
            columns={["Sede", "Ingresos", "Egresos", "Resultado", "Rentabilidad"]}
            rows={rows}
          />
        </div>

        <div className="panel">
          <h3>Alertas</h3>
          <div className="alert-item danger">
            <strong>{cuentasVencidas.length} cuentas vencidas</strong>
            <span>Total: {formatMoney(deudaVencida)}</span>
          </div>
          <div className="alert-item warning">
            <strong>{conciliacionesPendientes.length} movimientos sin conciliar</strong>
            <span>Requieren revisión bancaria</span>
          </div>
          <div className="alert-item info">
            <strong>{cuentasFiltradas.length} registros en cuentas corrientes</strong>
            <span>Control operativo general</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Saldos bancarios por cuenta</h3>
        <DataTable columns={["Cuenta", "Saldo", "Pendientes"]} rows={bancosRows} />
      </div>
      </>
      )}
    </section>
  );
}
