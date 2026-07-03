import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, FileCheck, FileText, HandCoins, RefreshCw, Trash2, XCircle } from "lucide-react";

import Modal from "../components/Modal";
import {
  anularOrdenPago,
  aprobarOrdenPago,
  crearOrdenPago,
  deleteOrdenPago,
  getEgresosPendientesParaOrdenPago,
  getOrdenesPago,
  pagarOrdenPago,
} from "../services/ordenPagoService";
import { generarOrdenPagoPdf } from "../utils/ordenPagoPdf";

const ESTADOS = ["todos", "borrador", "aprobada", "pagada", "anulada"];

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

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const statusClass = (estado) => normalizeText(estado).replace(/\s+/g, "-");

function initialForm() {
  return {
    fecha: new Date().toISOString().split("T")[0],
    proveedor: "",
    proveedorCuit: "",
    sociedad: "",
    medioPago: "Transferencia",
    cuentaPago: "",
    concepto: "",
    observaciones: "",
    egresosIds: [],
  };
}

export default function OrdenesPago({ selectedSede, sedeId, currentUser }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("todos");
  const [proveedor, setProveedor] = useState("");
  const [ordenes, setOrdenes] = useState([]);
  const [egresosPendientes, setEgresosPendientes] = useState([]);
  const [egresoSearch, setEgresoSearch] = useState("");
  const [form, setForm] = useState(initialForm);
  const [selectedOrden, setSelectedOrden] = useState(null);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedSedeName =
    typeof selectedSede === "object" && selectedSede !== null
      ? selectedSede.nombre
      : selectedSede || "Todas las sedes";

  void currentUser;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getOrdenesPago({ desde, hasta, sedeId, estado, proveedor });
      setOrdenes(data || []);
    } catch (err) {
      console.error("Error cargando órdenes de pago:", err);
      setError(err.message || "No se pudieron cargar las órdenes de pago.");
    } finally {
      setLoading(false);
    }
  }, [desde, estado, hasta, proveedor, sedeId]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const resumen = useMemo(() => {
    const pagadas = ordenes.filter((orden) => orden.estado === "pagada");
    const pendientes = ordenes.filter((orden) => ["borrador", "aprobada"].includes(orden.estado));

    return {
      total: ordenes.length,
      pendientes: pendientes.length,
      pagadas: pagadas.length,
      importePagado: pagadas.reduce((acc, orden) => acc + Number(orden.importeTotal || 0), 0),
    };
  }, [ordenes]);

  const egresosFiltrados = useMemo(() => {
    const search = normalizeText(egresoSearch);
    if (!search) return egresosPendientes;

    return egresosPendientes.filter((egreso) =>
      [
        egreso.proveedor,
        egreso.concepto,
        egreso.comprobante,
        egreso.sociedad,
        egreso.categoria,
      ].some((value) => normalizeText(value).includes(search))
    );
  }, [egresoSearch, egresosPendientes]);

  const totalSeleccionado = useMemo(
    () =>
      egresosPendientes
        .filter((egreso) => form.egresosIds.includes(egreso.id))
        .reduce((acc, egreso) => acc + Number(egreso.importe || 0), 0),
    [egresosPendientes, form.egresosIds]
  );

  const openNuevaOrden = async () => {
    setSaving(true);
    setError("");

    try {
      const pendientes = await getEgresosPendientesParaOrdenPago({ sedeId, proveedor });
      setEgresosPendientes(pendientes || []);
      setForm((prev) => ({
        ...initialForm(),
        proveedor: proveedor || prev.proveedor || "",
        sociedad: selectedSedeName !== "Todas las sedes" ? selectedSedeName : "",
      }));
      setEgresoSearch("");
      setModal("nuevo");
    } catch (err) {
      console.error("Error cargando egresos pendientes:", err);
      setError(err.message || "No se pudieron cargar los egresos pendientes.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEgreso = (egreso) => {
    setForm((prev) => {
      const selected = prev.egresosIds.includes(egreso.id);
      const egresosIds = selected
        ? prev.egresosIds.filter((id) => id !== egreso.id)
        : [...prev.egresosIds, egreso.id];
      const selectedRows = egresosPendientes.filter((item) => egresosIds.includes(item.id));
      const first = selectedRows[0];

      return {
        ...prev,
        egresosIds,
        proveedor: prev.proveedor || first?.proveedor || egreso.proveedor || "",
        sociedad: prev.sociedad || first?.sociedad || egreso.sociedad || "",
      };
    });
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await crearOrdenPago({
        ...form,
        sedeId,
      });
      setModal(null);
      await loadData();
    } catch (err) {
      console.error("Error creando orden de pago:", err);
      setError(err.message || "No se pudo crear la orden de pago.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action, message) => {
    setSaving(true);
    setError("");

    try {
      await action();
      await loadData();
    } catch (err) {
      console.error(message, err);
      setError(err.message || message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <div className="page-header" data-tour="ordenes-pago-header">
        <div>
          <h2>Órdenes de Pago</h2>
          <p>Gestión de pagos a proveedores y egresos pendientes.</p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={loadData} disabled={loading || saving}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button
            className="primary-button"
            onClick={openNuevaOrden}
            disabled={saving}
            data-tour="ordenes-pago-nueva"
          >
            <FileCheck size={16} /> Nueva orden de pago
          </button>
        </div>
      </div>

      <div className="filters-bar ordenes-pago-filters" data-tour="ordenes-pago-filtros">
        <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} />
        <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} />
        <select value={estado} onChange={(event) => setEstado(event.target.value)}>
          {ESTADOS.map((item) => (
            <option key={item} value={item}>
              {item === "todos" ? "Todos" : item}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Proveedor"
          value={proveedor}
          onChange={(event) => setProveedor(event.target.value)}
        />
        <button className="secondary-button" onClick={loadData} disabled={loading || saving}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="stats-grid small" data-tour="ordenes-pago-resumen">
        <div className="stat-card">
          <div>
            <span>Total órdenes</span>
            <strong>{resumen.total}</strong>
            <small>{selectedSedeName}</small>
          </div>
          <FileCheck size={22} />
        </div>
        <div className="stat-card">
          <div>
            <span>Pendientes/aprobadas</span>
            <strong>{resumen.pendientes}</strong>
            <small>Órdenes por pagar</small>
          </div>
          <CheckCircle2 size={22} />
        </div>
        <div className="stat-card">
          <div>
            <span>Pagadas</span>
            <strong>{resumen.pagadas}</strong>
            <small>Órdenes finalizadas</small>
          </div>
          <HandCoins size={22} />
        </div>
        <div className="stat-card">
          <div>
            <span>Importe total pagado</span>
            <strong>{formatMoney(resumen.importePagado)}</strong>
            <small>Según filtros aplicados</small>
          </div>
          <HandCoins size={22} />
        </div>
      </div>

      <div className="panel" data-tour="ordenes-pago-tabla">
        <h3>Historial de órdenes</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Número</th>
                <th>Proveedor</th>
                <th>Sociedad</th>
                <th>Medio de pago</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8}>Cargando órdenes de pago...</td>
                </tr>
              )}

              {!loading &&
                ordenes.map((orden) => (
                  <tr key={orden.id}>
                    <td>{formatDate(orden.fecha)}</td>
                    <td>{orden.numeroFormateado}</td>
                    <td>{orden.proveedor}</td>
                    <td>{orden.sociedad || "-"}</td>
                    <td>{orden.medioPago || "-"}</td>
                    <td>{formatMoney(orden.importeTotal)}</td>
                    <td>
                      <span className={`status-badge ${statusClass(orden.estado)}`}>
                        {orden.estado}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions-wrap">
                        <button className="secondary-button" onClick={() => { setSelectedOrden(orden); setModal("detalle"); }}>
                          <Eye size={14} /> Ver
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => generarOrdenPagoPdf(orden)}
                          data-tour="ordenes-pago-pdf"
                        >
                          <FileText size={14} /> PDF
                        </button>
                        {orden.estado === "borrador" && (
                          <button
                            className="secondary-button"
                            disabled={saving}
                            onClick={() => runAction(() => aprobarOrdenPago(orden.id), "No se pudo aprobar la orden.")}
                          >
                            <CheckCircle2 size={14} /> Aprobar
                          </button>
                        )}
                        {["borrador", "aprobada"].includes(orden.estado) && (
                          <button
                            className="secondary-button"
                            disabled={saving}
                            onClick={() => runAction(() => pagarOrdenPago(orden.id), "No se pudo pagar la orden.")}
                          >
                            <HandCoins size={14} /> Pagar
                          </button>
                        )}
                        {orden.estado !== "pagada" && (
                          <button
                            className="secondary-button"
                            disabled={saving}
                            onClick={() => runAction(() => anularOrdenPago(orden.id), "No se pudo anular la orden.")}
                          >
                            <XCircle size={14} /> Anular
                          </button>
                        )}
                        {orden.estado === "borrador" && (
                          <button
                            className="secondary-button"
                            disabled={saving}
                            onClick={() => runAction(() => deleteOrdenPago(orden.id), "No se pudo eliminar la orden.")}
                          >
                            <Trash2 size={14} /> Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && ordenes.length === 0 && (
                <tr>
                  <td colSpan={8}>No hay órdenes de pago para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "nuevo" && (
        <Modal title="Nueva orden de pago" onClose={() => setModal(null)} size="large">
          <form onSubmit={handleCreate} data-tour="ordenes-pago-formulario">
            <div className="form-grid">
              <label>
                Fecha
                <input type="date" value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })} />
              </label>
              <label>
                Proveedor
                <input required value={form.proveedor} onChange={(event) => setForm({ ...form, proveedor: event.target.value })} />
              </label>
              <label>
                CUIT proveedor
                <input value={form.proveedorCuit} onChange={(event) => setForm({ ...form, proveedorCuit: event.target.value })} />
              </label>
              <label>
                Sociedad
                <input value={form.sociedad} onChange={(event) => setForm({ ...form, sociedad: event.target.value })} />
              </label>
              <label>
                Medio de pago
                <input value={form.medioPago} onChange={(event) => setForm({ ...form, medioPago: event.target.value })} />
              </label>
              <label>
                Cuenta pago
                <input value={form.cuentaPago} onChange={(event) => setForm({ ...form, cuentaPago: event.target.value })} />
              </label>
              <label>
                Concepto
                <input value={form.concepto} onChange={(event) => setForm({ ...form, concepto: event.target.value })} />
              </label>
              <label>
                Observaciones
                <input value={form.observaciones} onChange={(event) => setForm({ ...form, observaciones: event.target.value })} />
              </label>
            </div>

            <div className="filters-bar ordenes-egresos-filter">
              <input
                type="search"
                placeholder="Buscar egresos por proveedor, concepto o comprobante"
                value={egresoSearch}
                onChange={(event) => setEgresoSearch(event.target.value)}
              />
              <strong>Total seleccionado: {formatMoney(totalSeleccionado)}</strong>
            </div>

            <div className="table-card ordenes-egresos-table">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Fecha</th>
                    <th>Proveedor</th>
                    <th>Comprobante</th>
                    <th>Concepto</th>
                    <th>Categoría</th>
                    <th>Importe</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {egresosFiltrados.map((egreso) => (
                    <tr key={egreso.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={form.egresosIds.includes(egreso.id)}
                          onChange={() => toggleEgreso(egreso)}
                        />
                      </td>
                      <td>{formatDate(egreso.fecha)}</td>
                      <td>{egreso.proveedor}</td>
                      <td>{egreso.comprobante || "-"}</td>
                      <td>{egreso.concepto}</td>
                      <td>{egreso.categoria}</td>
                      <td>{formatMoney(egreso.importe)}</td>
                      <td>{egreso.estado}</td>
                    </tr>
                  ))}
                  {egresosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={8}>No hay egresos pendientes disponibles.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving || form.egresosIds.length === 0}>
                {saving ? "Guardando..." : "Crear orden"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "detalle" && selectedOrden && (
        <Modal title={`Detalle ${selectedOrden.numeroFormateado}`} onClose={() => setModal(null)} size="large">
          <div className="modal-actions detail-modal-actions">
            <button className="primary-button" onClick={() => generarOrdenPagoPdf(selectedOrden)}>
              <FileText size={16} /> Descargar PDF
            </button>
          </div>

          <div className="detail-grid">
            <div><span>Proveedor</span><strong>{selectedOrden.proveedor}</strong></div>
            <div><span>CUIT</span><strong>{selectedOrden.proveedorCuit || "-"}</strong></div>
            <div><span>Sociedad</span><strong>{selectedOrden.sociedad || "-"}</strong></div>
            <div><span>Medio de pago</span><strong>{selectedOrden.medioPago || "-"}</strong></div>
            <div><span>Estado</span><strong>{selectedOrden.estado}</strong></div>
            <div><span>Total</span><strong>{formatMoney(selectedOrden.importeTotal)}</strong></div>
            <div><span>Aprobada</span><strong>{selectedOrden.approvedAt ? formatDate(selectedOrden.approvedAt) : "-"}</strong></div>
            <div><span>Pagada</span><strong>{selectedOrden.paidAt ? formatDate(selectedOrden.paidAt) : "-"}</strong></div>
          </div>

          <div className="table-card detail-table-card">
            <table>
              <thead>
                <tr>
                  <th>Egreso</th>
                  <th>Descripción</th>
                  <th>Proveedor</th>
                  <th>Comprobante</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {selectedOrden.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.egresoId}</td>
                    <td>{item.descripcion || "-"}</td>
                    <td>{item.egreso?.proveedor || "-"}</td>
                    <td>{item.egreso?.comprobante || "-"}</td>
                    <td>{formatMoney(item.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </section>
  );
}
