import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, BookCheck, CalendarClock, FileSpreadsheet, RefreshCcw } from "lucide-react";
import {
  calcularResultadoEjercicio,
  crearEjercicioContable,
  generarAsientoAperturaNuevoEjercicio,
  generarAsientoCierreEjercicio,
  getBalanceAnualParaCierre,
  getEjerciciosContables,
  reabrirEjercicioContable,
  validarEjercicioListoParaCierre,
} from "../services/contabilidadService";
import { formatDate, formatMoney } from "../utils/format";

const currentYear = new Date().getFullYear();

function statusClass(value) {
  return String(value || "").toLowerCase() === "cerrado" ? "inactiva" : "activa";
}

function money(value) {
  return formatMoney(value || 0);
}

function BalanceTable({ title, rows }) {
  return (
    <div className="table-section">
      <div className="section-title-row">
        <h3>{title}</h3>
        <span>{rows.length} cuentas</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Cuenta</th>
              <th>Tipo</th>
              <th>Suma debe</th>
              <th>Suma haber</th>
              <th>Saldo deudor</th>
              <th>Saldo acreedor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.cuentaCodigo}-${row.tipo}`}>
                <td>{row.cuentaCodigo}</td>
                <td>{row.cuentaNombre}</td>
                <td>{row.tipo}</td>
                <td>{money(row.sumaDebe)}</td>
                <td>{money(row.sumaHaber)}</td>
                <td>{money(row.saldoDeudor)}</td>
                <td>{money(row.saldoAcreedor)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan="7" className="empty-state">Sin cuentas para mostrar.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CierreEjercicio({ selectedSede, sedeId }) {
  const [anio, setAnio] = useState(currentYear);
  const [ejercicios, setEjercicios] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [balance, setBalance] = useState(null);
  const [validacion, setValidacion] = useState({ listo: false, errores: [], warnings: [] });
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const ejercicio = useMemo(
    () => ejercicios.find((item) => Number(item.anio) === Number(anio)) || null,
    [anio, ejercicios],
  );

  const sedeFiltro = sedeId === "todas" ? null : sedeId;

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [ejerciciosData, resultadoData, balanceData, validacionData] = await Promise.all([
        getEjerciciosContables(),
        calcularResultadoEjercicio(anio, { sedeId: sedeFiltro }),
        getBalanceAnualParaCierre(anio, { sedeId: sedeFiltro }),
        validarEjercicioListoParaCierre(anio, { sedeId: sedeFiltro }),
      ]);

      setEjercicios(ejerciciosData);
      setResultado(resultadoData);
      setBalance(balanceData);
      setValidacion(validacionData);
    } catch (err) {
      setError(err.message || "No se pudo cargar el cierre de ejercicio.");
    } finally {
      setLoading(false);
    }
  }, [anio, sedeFiltro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(action) {
    setProcesando(true);
    setError("");

    try {
      await action();
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo completar la operación.");
    } finally {
      setProcesando(false);
    }
  }

  const checklist = [
    ["Ejercicio creado", Boolean(ejercicio)],
    ["12 períodos mensuales creados", !validacion.errores.some((item) => item.includes("12 períodos"))],
    ["12 períodos mensuales cerrados", !validacion.errores.some((item) => item.includes("períodos mensuales"))],
    ["Sin operaciones pendientes de asiento", !validacion.errores.some((item) => item.includes("pendientes"))],
    ["Sin asientos desbalanceados", !validacion.errores.some((item) => item.includes("desbalanceados"))],
    ["Balance sin diferencias", !validacion.errores.some((item) => item.includes("balance anual"))],
    ["Sin asiento de cierre previo", !validacion.errores.some((item) => item.includes("cierre activo"))],
  ];

  return (
    <div className="page">
      <div className="page-header" data-tour="cierre-ejercicio-header">
        <div>
          <h1>Cierre de Ejercicio</h1>
          <p>Cierre anual, resultado del ejercicio y apertura del nuevo período.</p>
          <span className="muted">Sede: {selectedSede?.nombre || selectedSede || "Todas las sedes"}</span>
        </div>
      </div>

      <div className="filters-bar" data-tour="cierre-ejercicio-selector">
        <label>
          Año
          <input type="number" min="2000" max="2100" value={anio} onChange={(event) => setAnio(event.target.value)} />
        </label>
        <button className="secondary-button" onClick={() => ejecutar(() => crearEjercicioContable({ anio }))} disabled={procesando}>
          <CalendarClock size={16} /> Crear ejercicio
        </button>
        <button className="secondary-button" onClick={cargar} disabled={loading || procesando}>
          <RefreshCcw size={16} /> Actualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="panel">Cargando información del ejercicio...</div>}

      {!loading && (
        <>
          <div className="stats-grid" data-tour="cierre-ejercicio-estado">
            <div className="stat-card"><span>Año</span><strong>{anio}</strong></div>
            <div className="stat-card"><span>Estado</span><strong><span className={`status-badge ${statusClass(ejercicio?.estado)}`}>{ejercicio?.estado || "sin crear"}</span></strong></div>
            <div className="stat-card"><span>Desde / hasta</span><strong>{ejercicio ? `${formatDate(ejercicio.fechaDesde)} - ${formatDate(ejercicio.fechaHasta)}` : "-"}</strong></div>
            <div className="stat-card"><span>Resultado del ejercicio</span><strong>{money(ejercicio?.resultadoEjercicio ?? resultado?.resultado)}</strong></div>
            <div className="stat-card"><span>Asiento de cierre</span><strong>{ejercicio?.asientoCierreId ? "Generado" : "Pendiente"}</strong></div>
            <div className="stat-card"><span>Asiento de apertura</span><strong>{ejercicio?.asientoAperturaId ? "Generado" : "Pendiente"}</strong></div>
          </div>

          <div className="stats-grid" data-tour="cierre-ejercicio-resultado">
            <div className="stat-card"><span>Total ingresos</span><strong>{money(resultado?.ingresos)}</strong></div>
            <div className="stat-card"><span>Total egresos</span><strong>{money(resultado?.egresos)}</strong></div>
            <div className="stat-card"><span>Resultado</span><strong>{money(resultado?.resultado)}</strong></div>
            <div className="stat-card"><span>Tipo</span><strong>{resultado?.utilidad ? "Utilidad" : resultado?.perdida ? "Pérdida" : "Neutro"}</strong></div>
          </div>

          <div className="panel" data-tour="cierre-ejercicio-validaciones">
            <div className="section-title-row">
              <h2>Validaciones de cierre</h2>
              <span className={`status-badge ${validacion.listo ? "activa" : "inactiva"}`}>{validacion.listo ? "Listo" : "Bloqueado"}</span>
            </div>
            <div className="checklist">
              {checklist.map(([label, ok]) => (
                <div key={label} className="checklist-item">
                  <span className={`status-dot ${ok ? "success" : "danger"}`} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {validacion.errores.map((item) => <div key={item} className="alert error">{item}</div>)}
            {validacion.warnings.map((item) => <div key={item} className="alert warning">{item}</div>)}
          </div>

          <div className="panel" data-tour="cierre-ejercicio-balance">
            <div className="section-title-row">
              <h2>Balance anual</h2>
              <span>{money(balance?.resultadoEjercicio)} resultado</span>
            </div>
            <BalanceTable title="Patrimoniales" rows={balance?.patrimoniales || []} />
            <BalanceTable title="Resultado" rows={balance?.resultado || []} />
          </div>

          <div className="panel" data-tour="cierre-ejercicio-acciones">
            <div className="section-title-row">
              <h2>Acciones</h2>
              <span>Operaciones controladas</span>
            </div>
            <div className="actions-row">
              <button
                className="primary-button"
                disabled={!validacion.listo || ejercicio?.estado !== "abierto" || procesando}
                onClick={() => {
                  if (window.confirm(`¿Generar el asiento de cierre del ejercicio ${anio}?`)) {
                    ejecutar(() => generarAsientoCierreEjercicio(anio, { sedeId: sedeFiltro }));
                  }
                }}
              >
                <BookCheck size={16} /> Generar asiento de cierre
              </button>
              <button
                className="secondary-button"
                disabled={ejercicio?.estado !== "cerrado" || Boolean(ejercicio?.asientoAperturaId) || procesando}
                onClick={() => ejecutar(() => generarAsientoAperturaNuevoEjercicio(anio, { sedeId: sedeFiltro }))}
              >
                <Archive size={16} /> Generar apertura nuevo ejercicio
              </button>
              <button
                className="secondary-button"
                disabled={ejercicio?.estado !== "cerrado" || procesando}
                onClick={() => {
                  const motivo = window.prompt("Motivo de reapertura");
                  if (motivo !== null) ejecutar(() => reabrirEjercicioContable(ejercicio.id, motivo));
                }}
              >
                <CalendarClock size={16} /> Reabrir ejercicio
              </button>
              <button className="secondary-button" disabled>
                <FileSpreadsheet size={16} /> Exportar resumen
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
