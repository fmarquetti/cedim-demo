import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";

import { getAuditoriaContable } from "../services/contabilidadService";
import {
  regenerarPendiente,
  regenerarTodosLosPendientes,
} from "../services/contabilidadReparacionService";
import { formatDate, formatMoney } from "../utils/reportUtils";

const PENDIENTES_GRUPOS = [
  ["facturasArcaSinAsiento", "Facturas ARCA sin asiento", "arca_invoice"],
  ["ingresosCobradosSinAsiento", "Ingresos cobrados sin asiento", "ingreso_cobro"],
  ["egresosSinAsiento", "Egresos sin asiento", "egreso"],
  ["egresosPagadosSinAsiento", "Egresos pagados sin asiento", "egreso_pago"],
  ["ordenesPagoPagadasSinAsiento", "Ordenes de pago pagadas sin asiento", "orden_pago"],
  ["conciliacionesIngresoSinAsiento", "Conciliaciones de ingresos sin asiento", "conciliacion_ingreso"],
  ["conciliacionesEgresoSinAsiento", "Conciliaciones de egresos sin asiento", "conciliacion_egreso"],
];

const INCONSISTENCIAS_GRUPOS = [
  ["asientosDesbalanceados", "Asientos desbalanceados"],
  ["asientosDuplicados", "Asientos duplicados por origen"],
  ["lineasInvalidas", "Lineas invalidas"],
  ["cuentasInactivasUsadas", "Cuentas inactivas usadas"],
  ["asientosSinLineas", "Asientos sin lineas"],
];

function getDescripcion(row) {
  return row.concepto || row.descripcion || row.proveedor || row.cliente_nombre || row.sociedad || row.id || "-";
}

function getFecha(row) {
  return row.fecha || row.fechaDb || row.created_at || row.emitted_at || row.paid_at;
}

function getImporte(row) {
  return row.importe || row.importe_total || row.importeTotal || row.total || row.monto || 0;
}

function getMotivoInconsistencia(tipo, row) {
  if (tipo === "asientosDesbalanceados") return `Diferencia ${formatMoney(row.diferencia)}`;
  if (tipo === "asientosDuplicados") return `${row.cantidad} asientos para ${row.origen} ${row.origenId}`;
  if (tipo === "lineasInvalidas") return row.motivo;
  if (tipo === "cuentasInactivasUsadas") return `${row.cuentaCodigo} - ${row.cuentaNombre}`;
  if (tipo === "asientosSinLineas") return "Asiento sin lineas";
  return "-";
}

function getNumeroInconsistencia(tipo, row) {
  if (tipo === "asientosDuplicados") {
    return row.asientos?.map((asiento) => asiento.numero || asiento.id).join(", ") || "-";
  }

  return row.numero || row.asientoId || "-";
}

function getFechaInconsistencia(tipo, row) {
  if (tipo === "asientosDuplicados") {
    return row.asientos?.[0]?.fecha;
  }

  return row.fecha;
}

function EmptyRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan}>No hay registros para mostrar.</td>
    </tr>
  );
}

export default function AuditoriaContable({ selectedSede, sedeId, currentUser, setActivePage }) {
  const [auditoria, setAuditoria] = useState(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);

  void selectedSede;
  void currentUser;

  const loadAuditoria = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getAuditoriaContable({ desde, hasta, sedeId });
      setAuditoria(data);
    } catch (err) {
      console.error("Error cargando auditoria contable:", err);
      setError(err.message || "No se pudo cargar la auditoria contable.");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, sedeId]);

  useEffect(() => {
    void Promise.resolve().then(loadAuditoria);
  }, [loadAuditoria]);

  const resumenCards = useMemo(() => {
    const pendientes = auditoria?.pendientes || {};
    const inconsistencias = auditoria?.inconsistencias || {};
    const resumen = auditoria?.resumen || {};

    return [
      ["Total pendientes", resumen.totalPendientes || 0],
      ["Total inconsistencias", resumen.totalInconsistencias || 0],
      ["Total alertas", resumen.totalAlertas || 0],
      ["Facturas ARCA sin asiento", pendientes.facturasArcaSinAsiento?.length || 0],
      ["Egresos sin asiento", pendientes.egresosSinAsiento?.length || 0],
      ["Asientos desbalanceados", inconsistencias.asientosDesbalanceados?.length || 0],
    ];
  }, [auditoria]);

  const regenerarTodos = async () => {
    const ok = window.confirm(
      "Se intentaran regenerar todos los asientos pendientes del periodo seleccionado. ¿Continuar?"
    );
    if (!ok) return;

    setProcesando(true);
    setError("");
    setResultado(null);

    try {
      const data = await regenerarTodosLosPendientes({ desde, hasta, sedeId });
      setResultado(data);
      await loadAuditoria();
    } catch (err) {
      console.error("Error regenerando pendientes:", err);
      setError(err.message || "No se pudieron regenerar los pendientes.");
    } finally {
      setProcesando(false);
    }
  };

  const regenerarUno = async (tipo, id) => {
    setProcesando(true);
    setError("");
    setResultado(null);

    try {
      const data = await regenerarPendiente(tipo, id);
      setResultado({
        procesados: 1,
        reparados: data?.skipped || data?.status === "skipped" ? 0 : 1,
        omitidos: data?.skipped || data?.status === "skipped" ? 1 : 0,
        errores: [],
      });
      await loadAuditoria();
    } catch (err) {
      console.error("Error regenerando asiento:", err);
      setError(err.message || "No se pudo regenerar el asiento.");
    } finally {
      setProcesando(false);
    }
  };

  const noHayDatos =
    !loading &&
    auditoria &&
    auditoria.resumen.totalPendientes === 0 &&
    auditoria.resumen.totalInconsistencias === 0;

  return (
    <section className="page">
      <div className="page-header" data-tour="auditoria-header">
        <div>
          <h2>Auditoría Contable</h2>
          <p>Control de asientos pendientes, inconsistencias y reparación contable.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={loadAuditoria} disabled={loading || procesando}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="primary-button" onClick={regenerarTodos} disabled={loading || procesando || !auditoria}>
            <RotateCcw size={16} /> Regenerar pendientes
          </button>
        </div>
      </div>

      <div className="filters-bar" data-tour="auditoria-filtros">
        <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} />
        <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} />
        <button className="secondary-button" onClick={loadAuditoria} disabled={loading || procesando}>
          <RefreshCw size={16} /> Actualizar
        </button>
        <button className="primary-button" onClick={regenerarTodos} disabled={loading || procesando || !auditoria}>
          <RotateCcw size={16} /> Regenerar pendientes
        </button>
      </div>

      <div className="panel">
        <p className="muted no-margin-top">
          Las inconsistencias no se corrigen automaticamente. Para ajustes contables usa Asientos Manuales.
        </p>
        {setActivePage && (
          <button className="secondary-button" onClick={() => setActivePage("asientosManuales")}>
            Ir a Asientos Manuales
          </button>
        )}
      </div>

      {error && <div className="login-error">{error}</div>}
      {procesando && <div className="panel"><p className="muted">Procesando reparación contable...</p></div>}
      {loading && <div className="panel"><p className="muted">Cargando auditoría contable...</p></div>}

      {resultado && (
        <div className="panel">
          <h3>Resultado de reparación</h3>
          <p className="muted no-margin-top">
            Procesados: {resultado.procesados} | Reparados: {resultado.reparados} | Omitidos: {resultado.omitidos} | Errores: {resultado.errores.length}
          </p>
          {resultado.errores.length > 0 && (
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>ID</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.errores.map((item) => (
                    <tr key={`${item.tipo}-${item.id}`}>
                      <td>{item.tipo}</td>
                      <td>{item.id}</td>
                      <td>{item.mensaje}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {auditoria && (
        <>
          <div className="stats-grid small" data-tour="auditoria-resumen">
            {resumenCards.map(([label, value]) => (
              <div className="stat-card" key={label}>
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
                <ShieldAlert size={22} />
              </div>
            ))}
          </div>

          {noHayDatos && (
            <div className="panel">
              <p className="muted">No se detectaron pendientes ni inconsistencias para los filtros seleccionados.</p>
            </div>
          )}

          <div className="panel" data-tour="auditoria-pendientes">
            <h3>Pendientes de asiento</h3>
            {PENDIENTES_GRUPOS.map(([key, title, tipo]) => {
              const rows = auditoria.pendientes[key] || [];

              return (
                <details className="table-card details-table" key={key} open={rows.length > 0}>
                  <summary className="details-summary">
                    {title} ({rows.length})
                  </summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Descripción</th>
                        <th>Importe</th>
                        <th>Origen</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${tipo}-${row.id}`}>
                          <td>{formatDate(getFecha(row))}</td>
                          <td>{getDescripcion(row)}</td>
                          <td>{formatMoney(getImporte(row))}</td>
                          <td>{tipo}</td>
                          <td>
                            <button
                              className="secondary-button"
                              onClick={() => regenerarUno(tipo, row.id)}
                              disabled={procesando}
                            >
                              <RotateCcw size={14} /> Regenerar asiento
                            </button>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && <EmptyRow colSpan={5} />}
                    </tbody>
                  </table>
                </details>
              );
            })}
          </div>

          <div className="panel" data-tour="auditoria-inconsistencias">
            <h3>Inconsistencias contables</h3>
            {INCONSISTENCIAS_GRUPOS.map(([key, title]) => {
              const rows = auditoria.inconsistencias[key] || [];

              return (
                <details className="table-card details-table" key={key} open={rows.length > 0}>
                  <summary className="details-summary">
                    {title} ({rows.length})
                  </summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Número</th>
                        <th>Concepto</th>
                        <th>Motivo</th>
                        <th>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={`${key}-${row.asientoId || row.lineaId || row.origenId || index}`}>
                          <td>{formatDate(getFechaInconsistencia(key, row))}</td>
                          <td>{getNumeroInconsistencia(key, row)}</td>
                          <td>{row.concepto || row.asientos?.[0]?.concepto || row.origen || "-"}</td>
                          <td>{getMotivoInconsistencia(key, row)}</td>
                          <td>{row.diferencia !== undefined ? formatMoney(row.diferencia) : "-"}</td>
                        </tr>
                      ))}
                      {rows.length === 0 && <EmptyRow colSpan={5} />}
                    </tbody>
                  </table>
                </details>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
