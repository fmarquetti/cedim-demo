import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

import {
  generarBalanceSumasYSaldos,
  generarLibroDiario,
  generarLibroMayor,
  getCuentasContables,
} from "../services/contabilidadService";

const VISTAS = {
  plan: "Plan de cuentas",
  diario: "Libro diario",
  mayor: "Libro mayor",
  balance: "Balance de sumas y saldos",
};

const formatMoney = (value = 0) =>
  `$ ${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (fecha) => {
  if (!fecha) return "-";
  const clean = String(fecha).includes("T") ? fecha.split("T")[0] : fecha;
  const [year, month, day] = clean.split("-");
  if (!year || !month || !day) return fecha;
  return `${day}/${month}/${year}`;
};

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function downloadCsv(nombre, headers, rows) {
  const contenido = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");

  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nombre}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function EmptyRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan}>No hay informacion para los filtros seleccionados.</td>
    </tr>
  );
}

export default function Contabilidad({ sedeId }) {
  const [cuentas, setCuentas] = useState([]);
  const [libroDiario, setLibroDiario] = useState([]);
  const [libroMayor, setLibroMayor] = useState([]);
  const [balance, setBalance] = useState([]);
  const [cuentaMayorId, setCuentaMayorId] = useState("");

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [vista, setVista] = useState("plan");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { desde, hasta, sedeId };

      const [cuentasData, diarioData, mayorData, balanceData] = await Promise.all([
        getCuentasContables(),
        generarLibroDiario(params),
        generarLibroMayor({ ...params, cuentaId: cuentaMayorId || undefined }),
        generarBalanceSumasYSaldos(params),
      ]);

      setCuentas(cuentasData || []);
      setLibroDiario(diarioData || []);
      setLibroMayor(mayorData || []);
      setBalance(balanceData || []);
    } catch (err) {
      console.error("Error cargando contabilidad:", err);
      setError(err.message || "No se pudo cargar la informacion contable.");
    } finally {
      setLoading(false);
    }
  }, [cuentaMayorId, desde, hasta, sedeId]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const cuentasImputables = useMemo(
    () => cuentas.filter((cuenta) => cuenta.imputable && cuenta.activa),
    [cuentas]
  );

  const exportarCsv = () => {
    if (vista === "plan") {
      downloadCsv(
        "contabilidad_plan_de_cuentas",
        ["Codigo", "Nombre", "Tipo", "Imputable", "Activa"],
        cuentas.map((cuenta) => [
          cuenta.codigo,
          cuenta.nombre,
          cuenta.tipo,
          cuenta.imputable ? "Si" : "No",
          cuenta.activa ? "Si" : "No",
        ])
      );
      return;
    }

    if (vista === "diario") {
      downloadCsv(
        "contabilidad_libro_diario",
        ["Fecha", "Numero", "Concepto", "Cuenta", "Debe", "Haber", "Origen"],
        libroDiario.map((fila) => [
          formatDate(fila.fecha),
          fila.numero,
          fila.concepto,
          `${fila.cuentaCodigo} ${fila.cuentaNombre}`,
          fila.debe,
          fila.haber,
          fila.origen,
        ])
      );
      return;
    }

    if (vista === "mayor") {
      const rows = libroMayor.flatMap((grupo) =>
        grupo.movimientos.map((mov) => [
          grupo.cuentaCodigo,
          grupo.cuentaNombre,
          formatDate(mov.fecha),
          mov.numero,
          mov.concepto,
          mov.descripcion || "",
          mov.debe,
          mov.haber,
          mov.saldo,
        ])
      );

      downloadCsv(
        "contabilidad_libro_mayor",
        ["Codigo", "Cuenta", "Fecha", "Numero", "Concepto", "Descripcion", "Debe", "Haber", "Saldo"],
        rows
      );
      return;
    }

    downloadCsv(
      "contabilidad_balance_sumas_y_saldos",
      ["Codigo", "Cuenta", "Tipo", "Suma debe", "Suma haber", "Saldo deudor", "Saldo acreedor"],
      balance.map((fila) => [
        fila.cuentaCodigo,
        fila.cuentaNombre,
        fila.tipo,
        fila.sumaDebe,
        fila.sumaHaber,
        fila.saldoDeudor,
        fila.saldoAcreedor,
      ])
    );
  };

  const hasExportData =
    (vista === "plan" && cuentas.length > 0) ||
    (vista === "diario" && libroDiario.length > 0) ||
    (vista === "mayor" && libroMayor.length > 0) ||
    (vista === "balance" && balance.length > 0);

  return (
    <section className="page">
      <div className="page-header" data-tour="contabilidad-header">
        <div>
          <h2>Contabilidad</h2>
          <p>Plan de cuentas, libro diario, mayores y balance de sumas y saldos.</p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="primary-button" onClick={exportarCsv} disabled={loading || !hasExportData}>
            <Download size={16} /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="filters-bar" data-tour="contabilidad-filtros">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button className="secondary-button" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} /> Actualizar
        </button>

        <select value={vista} onChange={(e) => setVista(e.target.value)} data-tour="contabilidad-vista">
          {Object.entries(VISTAS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="panel" data-tour="contabilidad-contenido">
        {error && <div className="login-error">{error}</div>}

        {!error && loading && <p className="muted">Cargando informacion contable...</p>}

        {!error && !loading && vista === "plan" && (
          <>
            <h3>Plan de cuentas</h3>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Imputable</th>
                    <th>Activa</th>
                  </tr>
                </thead>
                <tbody>
                  {cuentas.map((cuenta) => (
                    <tr key={cuenta.id}>
                      <td>{cuenta.codigo}</td>
                      <td>{cuenta.nombre}</td>
                      <td>{cuenta.tipo}</td>
                      <td>{cuenta.imputable ? "Si" : "No"}</td>
                      <td>
                        <span className={`status-badge ${cuenta.activa ? "activa" : "inactiva"}`}>
                          {cuenta.activa ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {cuentas.length === 0 && <EmptyRow colSpan={5} />}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!error && !loading && vista === "diario" && (
          <>
            <h3>Libro diario</h3>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Numero</th>
                    <th>Concepto</th>
                    <th>Cuenta</th>
                    <th>Debe</th>
                    <th>Haber</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {libroDiario.map((fila, index) => (
                    <tr key={`${fila.numero}-${fila.cuentaCodigo}-${index}`}>
                      <td>{formatDate(fila.fecha)}</td>
                      <td>{fila.numero}</td>
                      <td>{fila.concepto}</td>
                      <td>{fila.cuentaCodigo} - {fila.cuentaNombre}</td>
                      <td>{formatMoney(fila.debe)}</td>
                      <td>{formatMoney(fila.haber)}</td>
                      <td>{fila.origen}</td>
                    </tr>
                  ))}
                  {libroDiario.length === 0 && <EmptyRow colSpan={7} />}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!error && !loading && vista === "mayor" && (
          <>
            <div className="filters-bar">
              <select value={cuentaMayorId} onChange={(e) => setCuentaMayorId(e.target.value)}>
                <option value="">Todas las cuentas</option>
                {cuentasImputables.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {cuenta.codigo} - {cuenta.nombre}
                  </option>
                ))}
              </select>
            </div>

            {libroMayor.map((grupo) => (
              <div className="table-card" key={grupo.cuentaId} style={{ marginBottom: 18 }}>
                <table>
                  <thead>
                    <tr>
                      <th colSpan={4}>{grupo.cuentaCodigo} - {grupo.cuentaNombre}</th>
                      <th>{formatMoney(grupo.totalDebe)}</th>
                      <th>{formatMoney(grupo.totalHaber)}</th>
                      <th>{formatMoney(grupo.saldoFinal)}</th>
                    </tr>
                    <tr>
                      <th>Fecha</th>
                      <th>Numero</th>
                      <th>Concepto</th>
                      <th>Descripcion</th>
                      <th>Debe</th>
                      <th>Haber</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.movimientos.map((mov, index) => (
                      <tr key={`${grupo.cuentaId}-${mov.numero}-${index}`}>
                        <td>{formatDate(mov.fecha)}</td>
                        <td>{mov.numero}</td>
                        <td>{mov.concepto}</td>
                        <td>{mov.descripcion || "-"}</td>
                        <td>{formatMoney(mov.debe)}</td>
                        <td>{formatMoney(mov.haber)}</td>
                        <td>{formatMoney(mov.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {libroMayor.length === 0 && (
              <div className="table-card">
                <table>
                  <tbody>
                    <EmptyRow colSpan={7} />
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {!error && !loading && vista === "balance" && (
          <>
            <h3>Balance de sumas y saldos</h3>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Cuenta</th>
                    <th>Tipo</th>
                    <th>Suma debe</th>
                    <th>Suma haber</th>
                    <th>Saldo deudor</th>
                    <th>Saldo acreedor</th>
                  </tr>
                </thead>
                <tbody>
                  {balance.map((fila) => (
                    <tr key={fila.cuentaCodigo}>
                      <td>{fila.cuentaCodigo}</td>
                      <td>{fila.cuentaNombre}</td>
                      <td>{fila.tipo}</td>
                      <td>{formatMoney(fila.sumaDebe)}</td>
                      <td>{formatMoney(fila.sumaHaber)}</td>
                      <td>{formatMoney(fila.saldoDeudor)}</td>
                      <td>{formatMoney(fila.saldoAcreedor)}</td>
                    </tr>
                  ))}
                  {balance.length === 0 && <EmptyRow colSpan={7} />}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
