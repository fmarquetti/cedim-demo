import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, ShieldCheck } from "lucide-react";

import Modal from "../components/Modal";
import {
  getAuditoriaEventos,
  getResumenAuditoria,
} from "../services/auditoriaService";

const OPCION_TODOS = "todos";
const SEVERIDADES = ["todos", "info", "warning", "error", "critical"];

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function jsonText(value) {
  if (!value) return "Sin datos.";
  return JSON.stringify(value, null, 2);
}

function uniqueOptions(eventos, field) {
  return [...new Set(eventos.map((evento) => evento[field]).filter(Boolean))].sort();
}

function SeveridadBadge({ value }) {
  return <span className={`status-badge ${value || "info"}`}>{value || "info"}</span>;
}

export default function HistorialAuditoria({ selectedSede, sedeId, currentUser }) {
  const [eventos, setEventos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtros, setFiltros] = useState({
    desde: "",
    hasta: "",
    modulo: OPCION_TODOS,
    accion: OPCION_TODOS,
    entidad: OPCION_TODOS,
    severidad: OPCION_TODOS,
    usuarioEmail: "",
    search: "",
  });

  void selectedSede;
  void sedeId;
  void currentUser;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [items, resumenData] = await Promise.all([
        getAuditoriaEventos(filtros),
        getResumenAuditoria({ desde: filtros.desde, hasta: filtros.hasta }),
      ]);
      setEventos(items);
      setResumen(resumenData);
    } catch (err) {
      console.error("Error cargando historial de auditoria:", err);
      setError(err.message || "No se pudo cargar el historial de auditoria.");
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const opciones = useMemo(() => ({
    modulos: uniqueOptions(eventos, "modulo"),
    acciones: uniqueOptions(eventos, "accion"),
    entidades: uniqueOptions(eventos, "entidad"),
  }), [eventos]);

  const updateFiltro = (field, value) => {
    setFiltros((prev) => ({ ...prev, [field]: value }));
  };

  const stats = [
    ["Total eventos", resumen?.totalEventos || 0],
    ["Info", resumen?.porSeveridad?.info || 0],
    ["Warnings", resumen?.porSeveridad?.warning || 0],
    ["Errores", (resumen?.porSeveridad?.error || 0) + (resumen?.porSeveridad?.critical || 0)],
    ["Usuarios activos", resumen?.usuariosActivos || 0],
    ["Modulos afectados", Object.keys(resumen?.porModulo || {}).length],
  ];

  return (
    <section className="page">
      <div className="page-header" data-tour="historial-auditoria-header">
        <div>
          <h2>Historial de Auditoría</h2>
          <p>Registro de acciones relevantes realizadas por los usuarios.</p>
        </div>
        <button className="secondary-button" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      <div className="filters-bar" data-tour="historial-auditoria-filtros">
        <input type="date" value={filtros.desde} onChange={(event) => updateFiltro("desde", event.target.value)} />
        <input type="date" value={filtros.hasta} onChange={(event) => updateFiltro("hasta", event.target.value)} />
        <select value={filtros.modulo} onChange={(event) => updateFiltro("modulo", event.target.value)}>
          <option value={OPCION_TODOS}>Todos los modulos</option>
          {opciones.modulos.map((modulo) => <option key={modulo} value={modulo}>{modulo}</option>)}
        </select>
        <select value={filtros.accion} onChange={(event) => updateFiltro("accion", event.target.value)}>
          <option value={OPCION_TODOS}>Todas las acciones</option>
          {opciones.acciones.map((accion) => <option key={accion} value={accion}>{accion}</option>)}
        </select>
        <select value={filtros.entidad} onChange={(event) => updateFiltro("entidad", event.target.value)}>
          <option value={OPCION_TODOS}>Todas las entidades</option>
          {opciones.entidades.map((entidad) => <option key={entidad} value={entidad}>{entidad}</option>)}
        </select>
        <select value={filtros.severidad} onChange={(event) => updateFiltro("severidad", event.target.value)}>
          {SEVERIDADES.map((item) => <option key={item} value={item}>{item === "todos" ? "Todas las severidades" : item}</option>)}
        </select>
        <input
          placeholder="Usuario/email"
          value={filtros.usuarioEmail}
          onChange={(event) => updateFiltro("usuarioEmail", event.target.value)}
        />
        <input
          placeholder="Buscar texto"
          value={filtros.search}
          onChange={(event) => updateFiltro("search", event.target.value)}
        />
        <button className="secondary-button" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}
      {loading && <div className="panel"><p className="muted">Cargando historial de auditoría...</p></div>}

      <div className="stats-grid small" data-tour="historial-auditoria-resumen">
        {stats.map(([label, value]) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
            <ShieldCheck size={22} />
          </div>
        ))}
      </div>

      <div className="panel" data-tour="historial-auditoria-tabla">
        <h3>Eventos</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha/hora</th>
                <th>Usuario</th>
                <th>Modulo</th>
                <th>Accion</th>
                <th>Entidad</th>
                <th>Descripcion</th>
                <th>Severidad</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id}>
                  <td>{formatDateTime(evento.fecha)}</td>
                  <td>{evento.usuarioEmail || evento.usuarioId || "Sistema"}</td>
                  <td>{evento.modulo}</td>
                  <td>{evento.accion}</td>
                  <td>{evento.entidad}</td>
                  <td>{evento.descripcion}</td>
                  <td><SeveridadBadge value={evento.severidad} /></td>
                  <td>
                    <button className="secondary-button" onClick={() => setDetalle(evento)}>
                      <Eye size={14} /> Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && eventos.length === 0 && (
                <tr>
                  <td colSpan={8}>No hay eventos para mostrar.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detalle && (
        <div data-tour="historial-auditoria-detalle">
          <Modal title="Detalle del evento" size="wide" onClose={() => setDetalle(null)}>
            <div className="details-grid">
              <p><strong>Fecha:</strong> {formatDateTime(detalle.fecha)}</p>
              <p><strong>Usuario:</strong> {detalle.usuarioEmail || detalle.usuarioId || "Sistema"}</p>
              <p><strong>Modulo:</strong> {detalle.modulo}</p>
              <p><strong>Accion:</strong> {detalle.accion}</p>
              <p><strong>Entidad:</strong> {detalle.entidad}</p>
              <p><strong>Entidad ID:</strong> {detalle.entidadId || "-"}</p>
              <p><strong>Descripcion:</strong> {detalle.descripcion}</p>
              <p><strong>Severidad:</strong> <SeveridadBadge value={detalle.severidad} /></p>
            </div>
            <h4>Datos antes</h4>
            <pre style={{ maxHeight: 180, overflow: "auto" }}>{jsonText(detalle.datosAntes)}</pre>
            <h4>Datos despues</h4>
            <pre style={{ maxHeight: 180, overflow: "auto" }}>{jsonText(detalle.datosDespues)}</pre>
            <h4>Metadata</h4>
            <pre style={{ maxHeight: 160, overflow: "auto" }}>{jsonText(detalle.metadata)}</pre>
          </Modal>
        </div>
      )}
    </section>
  );
}
