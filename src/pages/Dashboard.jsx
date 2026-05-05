import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  RefreshCw,
  TrendingUp,
  Wallet,
  Loader2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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

const formatMoney = (value = 0) =>
  `$ ${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const monthLabel = (date) =>
  date.toLocaleDateString("es-AR", {
    month: "short",
    year: "2-digit",
  });

const buildMonthlyChartData = (ingresos, egresos) => {
  const allDates = [...ingresos, ...egresos]
    .map((item) => parseDate(getFechaReal(item)))
    .filter(Boolean)
    .sort((a, b) => a - b);

  const now = new Date();
  const firstDate =
    allDates[0] || new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const start = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);

  const months = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;

    months.push({
      key,
      periodo: monthLabel(cursor),
      ingresos: 0,
      egresos: 0,
      resultado: 0,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  const map = Object.fromEntries(months.map((m) => [m.key, m]));

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

  return months.map((item) => ({
    ...item,
    resultado: item.ingresos - item.egresos,
  }));
};

const getCuentaCorrienteImpacto = (item) => {
  const comprobantesDeuda = [
    "Factura",
    "Factura A",
    "Factura B",
    "Factura C",
    "Nota de Débito",
  ];

  const esProveedor = item.tipoEntidad === "Proveedor";
  const sumaDeuda = comprobantesDeuda.includes(item.comprobante);

  if (esProveedor) return sumaDeuda ? toNumber(item.importe) : -toNumber(item.importe);

  return sumaDeuda ? toNumber(item.importe) : -toNumber(item.importe);
};

export default function Dashboard({ selectedSede, sedeId }) {
  const [ingresos, setIngresos] = useState([]);
  const [egresos, setEgresos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cuentasCorrientes, setCuentasCorrientes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard(currentSedeId = sedeId) {
    try {
      setLoading(true);
      setError("");

      const idParaFiltro = currentSedeId === "todas" ? null : currentSedeId;

      const [
        ingresosData,
        egresosData,
        movimientosData,
        cuentasCorrientesData,
      ] = await Promise.all([
        getIngresos(idParaFiltro),
        getEgresos(idParaFiltro),
        getMovimientosBancarios(idParaFiltro),
        getCuentasCorrientes(idParaFiltro),
      ]);

      setIngresos(ingresosData || []);
      setEgresos(egresosData || []);
      setMovimientos(movimientosData || []);
      setCuentasCorrientes(cuentasCorrientesData || []);
    } catch (err) {
      console.error("Error cargando dashboard:", err);
      setError("No se pudo cargar la información del dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard(sedeId);
  }, [sedeId]);

  const ingresosFiltrados = useMemo(
    () => ingresos,
    [ingresos]
  );

  const egresosFiltrados = useMemo(
    () => egresos,
    [egresos]
  );

  const movimientosFiltrados = useMemo(
    () => movimientos,
    [movimientos]
  );

  const cuentasFiltradas = useMemo(
    () => cuentasCorrientes,
    [cuentasCorrientes]
  );

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
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    return cuentasFiltradas.filter((item) => {
      if (!item.vencimiento || !isPending(item.estado)) return false;

      const vencimiento = parseDate(item.vencimiento);
      return vencimiento && vencimiento < hoy;
    });
  }, [cuentasFiltradas]);

  const deudaVencida = cuentasVencidas.reduce(
    (acc, item) => acc + toNumber(item.importe),
    0
  );

  const conciliacionesPendientes = movimientosFiltrados.filter((item) =>
    isPending(item.estado)
  );

  const chartData = useMemo(
    () => buildMonthlyChartData(ingresosFiltrados, egresosFiltrados),
    [ingresosFiltrados, egresosFiltrados]
  );

  const sedesResumen = useMemo(() => {
    const map = {};

    ingresosFiltrados.forEach((item) => {
      const sede = getSedeName(item);

      if (!map[sede]) {
        map[sede] = {
          sede,
          ingresos: 0,
          egresos: 0,
          resultado: 0,
        };
      }

      map[sede].ingresos += toNumber(item.importe);
    });

    egresosFiltrados.forEach((item) => {
      const sede = getSedeName(item);

      if (!map[sede]) {
        map[sede] = {
          sede,
          ingresos: 0,
          egresos: 0,
          resultado: 0,
        };
      }

      map[sede].egresos += toNumber(item.importe);
    });

    return Object.values(map)
      .map((item) => ({
        ...item,
        resultado: item.ingresos - item.egresos,
      }))
      .sort((a, b) => b.resultado - a.resultado);
  }, [ingresosFiltrados, egresosFiltrados]);

  const bancosPorCuenta = useMemo(() => {
    const map = {};

    movimientosFiltrados.forEach((item) => {
      if (!map[item.cuenta]) {
        map[item.cuenta] = {
          cuenta: item.cuenta,
          saldo: 0,
          pendientes: 0,
        };
      }

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
        <div className="page-header">
          <div>
            <h2>Dashboard principal</h2>
            <p>{error}</p>
          </div>

          <button className="secondary-button" onClick={() => loadDashboard(sedeId)}>
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Dashboard principal</h2>
          <p>Resumen financiero y operativo del laboratorio.</p>
        </div>

        <button className="secondary-button" onClick={() => loadDashboard(sedeId)}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      <div className="stats-grid">
        <StatCard
          title="Ingresos"
          value={formatMoney(totalIngresos)}
          detail={`${ingresosFiltrados.length} registros`}
          icon={<ArrowDownCircle size={22} />}
        />

        <StatCard
          title="Egresos"
          value={formatMoney(totalEgresos)}
          detail={`${egresosFiltrados.length} registros`}
          icon={<ArrowUpCircle size={22} />}
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
        />
      </div>

      <div className="charts-grid">
        <div className="panel">
          <h3>Ingresos vs egresos</h3>

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Line
                type="monotone"
                dataKey="ingresos"
                stroke="#019cc5"
                strokeWidth={3}
              />
              <Line
                type="monotone"
                dataKey="egresos"
                stroke="#3a73b9"
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Resultado por sede</h3>

          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sedesResumen}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sede" />
              <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="resultado" fill="#3eb9b1" radius={[8, 8, 0, 0]} />
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
              <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="resultado" fill="#028baf" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Caja por cuenta</h3>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bancosPorCuenta}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cuenta" />
              <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="saldo" fill="#3a73b9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="content-grid">
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

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Saldos bancarios por cuenta</h3>

        <DataTable columns={["Cuenta", "Saldo", "Pendientes"]} rows={bancosRows} />
      </div>
    </section>
  );
}