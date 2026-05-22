import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, LockKeyhole, RefreshCw, RotateCcw, SearchCheck } from "lucide-react";

import Modal from "../components/Modal";
import {
  cerrarPeriodoContable,
  crearPeriodoContable,
  crearPeriodosDelAnio,
  getAsientosPendientesControl,
  getPeriodosContables,
  reabrirPeriodoContable,
} from "../services/contabilidadService";

const formatDate = (value) => {
  if (!value) return "-";
  const clean = String(value).includes("T") ? value.split("T")[0] : value;
  const [year, month, day] = clean.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const getCurrentYear = () => new Date().getFullYear();

function PendingTable({ title, rows, columns }) {
  return (
    <details className="table-card" open={rows.length > 0} style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer", padding: 12, fontWeight: 700 }}>
        {title} ({rows.length})
      </summary>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key] || "-"}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length}>No hay pendientes en esta sección.</td>
            </tr>
          )}
        </tbody>
      </table>
    </details>
  );
}

export default function PeriodosContables({ selectedSede, sedeId, currentUser }) {
  const [periodos, setPeriodos] = useState([]);
  const [pendientes, setPendientes] = useState(null);
  const [anio, setAnio] = useState(getCurrentYear());
  const [selectedPeriodo, setSelectedPeriodo] = useState(null);
  const [observaciones, setObservaciones] = useState("");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  void selectedSede;
  void currentUser;
  void crearPeriodoContable;

  const loadPeriodos = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getPeriodosContables();
      setPeriodos(data || []);
    } catch (err) {
      console.error("Error cargando períodos contables:", err);
      setError(err.message || "No se pudieron cargar los períodos contables.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadPeriodos);
  }, [loadPeriodos]);

  const resumenPendientes = useMemo(() => {
    if (!pendientes) return [];

    return [
      ["Facturas ARCA sin asiento", pendientes.facturasArcaSinAsiento.length],
      ["Ingresos cobrados sin asiento", pendientes.ingresosCobradosSinAsiento.length],
      ["Egresos sin asiento", pendientes.egresosSinAsiento.length],
      ["Egresos pagados sin asiento", pendientes.egresosPagadosSinAsiento.length],
      ["Órdenes de pago pagadas sin asiento", pendientes.ordenesPagoPagadasSinAsiento.length],
      [
        "Conciliaciones sin asiento",
        pendientes.conciliacionesIngresoSinAsiento.length + pendientes.conciliacionesEgresoSinAsiento.length,
      ],
      ["Total pendientes", pendientes.resumen.totalPendientes],
    ];
  }, [pendientes]);

  const crearAnio = async () => {
    setSaving(true);
    setError("");

    try {
      const data = await crearPeriodosDelAnio(anio);
      setPeriodos(data || []);
    } catch (err) {
      console.error("Error creando períodos:", err);
      setError(err.message || "No se pudieron crear los períodos del año.");
    } finally {
      setSaving(false);
    }
  };

  const openCerrar = (periodo) => {
    setSelectedPeriodo(periodo);
    setObservaciones(periodo.observaciones || "");
    setModal("cerrar");
  };

  const confirmarCerrar = async () => {
    setSaving(true);
    setError("");

    try {
      await cerrarPeriodoContable(selectedPeriodo.id, observaciones);
      setModal(null);
      await loadPeriodos();
    } catch (err) {
      console.error("Error cerrando período:", err);
      setError(err.message || "No se pudo cerrar el período.");
    } finally {
      setSaving(false);
    }
  };

  const reabrir = async (periodo) => {
    setSaving(true);
    setError("");

    try {
      await reabrirPeriodoContable(periodo.id);
      await loadPeriodos();
    } catch (err) {
      console.error("Error reabriendo período:", err);
      setError(err.message || "No se pudo reabrir el período.");
    } finally {
      setSaving(false);
    }
  };

  const verPendientes = async () => {
    setSaving(true);
    setError("");

    try {
      const data = await getAsientosPendientesControl({ sedeId });
      setPendientes(data);
    } catch (err) {
      console.error("Error cargando control de pendientes:", err);
      setError(err.message || "No se pudo cargar el control de pendientes.");
    } finally {
      setSaving(false);
    }
  };

  const commonColumns = [
    { key: "fecha", label: "Fecha", render: (row) => formatDate(row.fecha || row.created_at || row.emitted_at) },
    { key: "concepto", label: "Concepto", render: (row) => row.concepto || row.descripcion || row.proveedor || row.cliente_nombre || "-" },
    { key: "importe", label: "Importe", render: (row) => Number(row.importe || row.importe_total || row.importeTotal || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" }) },
    { key: "estado", label: "Estado" },
  ];

  return (
    <section className="page">
      <div className="page-header" data-tour="periodos-header">
        <div>
          <h2>Períodos Contables</h2>
          <p>Cierre mensual, bloqueo de períodos y control de operaciones pendientes de asiento.</p>
        </div>
      </div>

      <div className="filters-bar" data-tour="periodos-acciones">
        <input
          type="number"
          min="2000"
          max="2100"
          value={anio}
          onChange={(event) => setAnio(event.target.value)}
          aria-label="Año"
        />
        <button className="primary-button" onClick={crearAnio} disabled={saving}>
          <CalendarCheck size={16} /> Crear períodos del año
        </button>
        <button className="secondary-button" onClick={loadPeriodos} disabled={loading || saving}>
          <RefreshCw size={16} /> Actualizar
        </button>
        <button className="secondary-button" onClick={verPendientes} disabled={saving}>
          <SearchCheck size={16} /> Ver control de pendientes
        </button>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>
          Antes de cerrar un período, revisá la Auditoría Contable para confirmar que no existan asientos pendientes o inconsistencias.
        </p>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="panel" data-tour="periodos-tabla">
        <h3>Períodos mensuales</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Año</th>
                <th>Mes</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th>Estado</th>
                <th>Cerrado el</th>
                <th>Observaciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8}>Cargando períodos contables...</td>
                </tr>
              )}

              {!loading && periodos.map((periodo) => (
                <tr key={periodo.id}>
                  <td>{periodo.anio}</td>
                  <td>{periodo.mes}</td>
                  <td>{formatDate(periodo.fechaDesde)}</td>
                  <td>{formatDate(periodo.fechaHasta)}</td>
                  <td>
                    <span className={`status-badge ${periodo.estado === "cerrado" ? "inactiva" : "activa"}`}>
                      {periodo.estado}
                    </span>
                  </td>
                  <td>{formatDate(periodo.cerradoAt)}</td>
                  <td>{periodo.observaciones || "-"}</td>
                  <td>
                    {periodo.estado === "abierto" ? (
                      <button className="secondary-button" onClick={() => openCerrar(periodo)} disabled={saving}>
                        <LockKeyhole size={14} /> Cerrar
                      </button>
                    ) : (
                      <button className="secondary-button" onClick={() => reabrir(periodo)} disabled={saving}>
                        <RotateCcw size={14} /> Reabrir
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {!loading && periodos.length === 0 && (
                <tr>
                  <td colSpan={8}>No hay períodos contables creados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendientes && (
        <div className="panel" data-tour="periodos-pendientes">
          <h3>Control de pendientes</h3>
          <div className="stats-grid small">
            {resumenPendientes.map(([label, value]) => (
              <div className="stat-card" key={label}>
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
                <SearchCheck size={22} />
              </div>
            ))}
          </div>

          <PendingTable title="Facturas ARCA sin asiento" rows={pendientes.facturasArcaSinAsiento} columns={commonColumns} />
          <PendingTable title="Ingresos cobrados sin asiento" rows={pendientes.ingresosCobradosSinAsiento} columns={commonColumns} />
          <PendingTable title="Egresos sin asiento" rows={pendientes.egresosSinAsiento} columns={commonColumns} />
          <PendingTable title="Egresos pagados sin asiento" rows={pendientes.egresosPagadosSinAsiento} columns={commonColumns} />
          <PendingTable title="Órdenes de pago sin asiento" rows={pendientes.ordenesPagoPagadasSinAsiento} columns={commonColumns} />
          <PendingTable
            title="Conciliaciones sin asiento"
            rows={[...pendientes.conciliacionesIngresoSinAsiento, ...pendientes.conciliacionesEgresoSinAsiento]}
            columns={commonColumns}
          />
        </div>
      )}

      {modal === "cerrar" && selectedPeriodo && (
        <Modal title="Cerrar período contable" onClose={() => setModal(null)}>
          <p>
            Período {selectedPeriodo.mes}/{selectedPeriodo.anio}. Al cerrar el período se bloquearán nuevas modificaciones
            contables dentro de estas fechas.
          </p>
          <label>
            Observaciones
            <textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} rows={4} />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button type="button" className="primary-button" onClick={confirmarCerrar} disabled={saving}>
              Confirmar cierre
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
