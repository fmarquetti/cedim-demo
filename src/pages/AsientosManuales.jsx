import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Edit3, FilePenLine, Plus, RefreshCw, ShieldCheck, Trash2, XCircle } from "lucide-react";

import {
  actualizarAsientoManual,
  anularAsientoManual,
  confirmarAsientoManual,
  crearAsientoManual,
  duplicarAsientoManual,
  getAsientoContableById,
  getAsientosContables,
  getCuentasContables,
} from "../services/contabilidadService";
import { formatDate, formatMoney } from "../utils/reportUtils";

const TIPOS = [
  ["manual", "Manual"],
  ["ajuste", "Ajuste"],
  ["apertura", "Apertura"],
  ["reclasificacion", "Reclasificacion"],
  ["correccion", "Correccion"],
];

const emptyLine = () => ({ cuentaId: "", descripcion: "", debe: "", haber: "" });

function today() {
  return new Date().toISOString().split("T")[0];
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getTotals(lineas) {
  const totalDebe = money(lineas.reduce((acc, linea) => acc + Number(linea.debe || 0), 0));
  const totalHaber = money(lineas.reduce((acc, linea) => acc + Number(linea.haber || 0), 0));
  return { totalDebe, totalHaber, diferencia: money(totalDebe - totalHaber) };
}

function isManualRow(asiento) {
  return ["manual", "ajuste"].includes(asiento.origen) && asiento.tipoAsiento !== "automatico";
}

function EmptyRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan}>No hay asientos manuales para los filtros seleccionados.</td>
    </tr>
  );
}

export default function AsientosManuales({ selectedSede, sedeId, currentUser }) {
  const [cuentas, setCuentas] = useState([]);
  const [asientos, setAsientos] = useState([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [form, setForm] = useState({
    fecha: today(),
    tipoAsiento: "manual",
    concepto: "",
    observaciones: "",
    lineas: [emptyLine(), emptyLine()],
  });

  void selectedSede;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [cuentasData, asientosData] = await Promise.all([
        getCuentasContables(),
        getAsientosContables({ desde, hasta, sedeId, estado, tipoAsiento: tipo }),
      ]);

      setCuentas((cuentasData || []).filter((cuenta) => cuenta.imputable && cuenta.activa));
      setAsientos((asientosData || []).filter((asiento) => isManualRow(asiento)));
    } catch (err) {
      console.error("Error cargando asientos manuales:", err);
      setError(err.message || "No se pudieron cargar los asientos manuales.");
    } finally {
      setLoading(false);
    }
  }, [desde, estado, hasta, sedeId, tipo]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const resumen = useMemo(() => {
    const totalDebe = money(asientos.reduce((acc, asiento) => acc + getTotals(asiento.lineas).totalDebe, 0));
    const totalHaber = money(asientos.reduce((acc, asiento) => acc + getTotals(asiento.lineas).totalHaber, 0));

    return {
      total: asientos.length,
      borradores: asientos.filter((asiento) => asiento.estado === "borrador").length,
      confirmados: asientos.filter((asiento) => asiento.estado === "confirmado").length,
      anulados: asientos.filter((asiento) => asiento.estado === "anulado").length,
      totalDebe,
      totalHaber,
    };
  }, [asientos]);

  const formTotals = useMemo(() => getTotals(form.lineas), [form.lineas]);

  const formError = useMemo(() => {
    if (!form.fecha) return "La fecha es obligatoria.";
    if (!form.concepto.trim()) return "El concepto es obligatorio.";
    if (form.lineas.length < 2) return "El asiento debe tener al menos 2 lineas.";

    for (const [index, linea] of form.lineas.entries()) {
      const debe = Number(linea.debe || 0);
      const haber = Number(linea.haber || 0);
      if (!linea.cuentaId) return `La linea ${index + 1} no tiene cuenta.`;
      if (debe < 0 || haber < 0) return `La linea ${index + 1} tiene importes negativos.`;
      if (debe > 0 && haber > 0) return `La linea ${index + 1} tiene debe y haber simultaneos.`;
      if (debe === 0 && haber === 0) return `La linea ${index + 1} debe tener importe.`;
    }

    if (Math.abs(formTotals.diferencia) > 0.01) return "El asiento no balancea.";
    return "";
  }, [form, formTotals.diferencia]);

  const openNew = () => {
    setSelected(null);
    setForm({
      fecha: today(),
      tipoAsiento: "manual",
      concepto: "",
      observaciones: "",
      lineas: [emptyLine(), emptyLine()],
    });
    setModal("form");
  };

  const openEdit = async (asiento) => {
    setSaving(true);
    setError("");

    try {
      const data = await getAsientoContableById(asiento.id);
      setSelected(data);
      setForm({
        fecha: data.fecha,
        tipoAsiento: data.tipoAsiento || "manual",
        concepto: data.concepto || "",
        observaciones: data.observaciones || "",
        lineas: data.lineas.length ? data.lineas.map((linea) => ({
          cuentaId: linea.cuentaId || "",
          descripcion: linea.descripcion || "",
          debe: linea.debe || "",
          haber: linea.haber || "",
        })) : [emptyLine(), emptyLine()],
      });
      setModal("form");
    } catch (err) {
      setError(err.message || "No se pudo abrir el asiento.");
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      lineas: prev.lineas.map((linea, currentIndex) =>
        currentIndex === index ? { ...linea, [field]: value } : linea
      ),
    }));
  };

  const saveForm = async (nextEstado = "borrador") => {
    if (formError) {
      setError(formError);
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      ...form,
      sedeId,
      estado: nextEstado,
      createdBy: currentUser?.id || null,
      lineas: form.lineas.map((linea) => ({
        ...linea,
        debe: money(linea.debe),
        haber: money(linea.haber),
      })),
    };

    try {
      if (selected) {
        await actualizarAsientoManual(selected.id, payload);
        if (nextEstado === "confirmado") await confirmarAsientoManual(selected.id);
      } else {
        await crearAsientoManual(payload);
      }

      setModal(null);
      await loadData();
    } catch (err) {
      console.error("Error guardando asiento manual:", err);
      setError(err.message || "No se pudo guardar el asiento manual.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRow = async (asiento) => {
    setSaving(true);
    setError("");

    try {
      await confirmarAsientoManual(asiento.id);
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo confirmar el asiento.");
    } finally {
      setSaving(false);
    }
  };

  const duplicateRow = async (asiento) => {
    setSaving(true);
    setError("");

    try {
      await duplicarAsientoManual(asiento.id);
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo duplicar el asiento.");
    } finally {
      setSaving(false);
    }
  };

  const openAnular = (asiento) => {
    setSelected(asiento);
    setMotivo("");
    setModal("anular");
  };

  const anular = async () => {
    if (!motivo.trim()) {
      setError("El motivo de anulacion es obligatorio.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await anularAsientoManual(selected.id, motivo);
      setModal(null);
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo anular el asiento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <div className="page-header" data-tour="asientos-manuales-header">
        <div>
          <h2>Asientos Manuales</h2>
          <p>Carga de ajustes, reclasificaciones y asientos contables manuales.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={loadData} disabled={loading || saving}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="primary-button" onClick={openNew} disabled={saving}>
            <Plus size={16} /> Nuevo Asiento
          </button>
        </div>
      </div>

      <div className="filters-bar" data-tour="asientos-manuales-filtros">
        <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} />
        <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} />
        <select value={estado} onChange={(event) => setEstado(event.target.value)}>
          <option value="todos">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="confirmado">Confirmado</option>
          <option value="anulado">Anulado</option>
        </select>
        <select value={tipo} onChange={(event) => setTipo(event.target.value)}>
          <option value="todos">Todos los tipos</option>
          {TIPOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button className="secondary-button" onClick={loadData} disabled={loading || saving}>
          <RefreshCw size={16} /> Actualizar
        </button>
        <button className="primary-button" onClick={openNew} disabled={saving}>
          <Plus size={16} /> Nuevo Asiento
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}
      {loading && <div className="panel"><p className="muted">Cargando asientos manuales...</p></div>}

      <div className="stats-grid small" data-tour="asientos-manuales-resumen">
        {[
          ["Total asientos manuales", resumen.total],
          ["Borradores", resumen.borradores],
          ["Confirmados", resumen.confirmados],
          ["Anulados", resumen.anulados],
          ["Total debe", formatMoney(resumen.totalDebe)],
          ["Total haber", formatMoney(resumen.totalHaber)],
        ].map(([label, value]) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
            <FilePenLine size={22} />
          </div>
        ))}
      </div>

      <div className="panel" data-tour="asientos-manuales-tabla">
        <h3>Listado de asientos</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Numero</th>
                <th>Concepto</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Total debe</th>
                <th>Total haber</th>
                <th>Diferencia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {asientos.map((asiento) => {
                const totals = getTotals(asiento.lineas);
                const editable = asiento.estado === "borrador" && isManualRow(asiento);

                return (
                  <tr key={asiento.id}>
                    <td>{formatDate(asiento.fecha)}</td>
                    <td>{asiento.numero || "-"}</td>
                    <td>{asiento.concepto}</td>
                    <td>{asiento.tipoAsiento}</td>
                    <td><span className={`status-badge ${asiento.estado}`}>{asiento.estado}</span></td>
                    <td>{formatMoney(totals.totalDebe)}</td>
                    <td>{formatMoney(totals.totalHaber)}</td>
                    <td>{formatMoney(totals.diferencia)}</td>
                    <td>
                      <button className="secondary-button" onClick={() => openEdit(asiento)} disabled={saving}>
                        <Edit3 size={14} /> {editable ? "Editar" : "Ver"}
                      </button>
                      {asiento.estado === "borrador" && (
                        <button className="secondary-button" onClick={() => confirmRow(asiento)} disabled={saving}>
                          <ShieldCheck size={14} /> Confirmar
                        </button>
                      )}
                      <button className="secondary-button" onClick={() => duplicateRow(asiento)} disabled={saving}>
                        <Copy size={14} /> Duplicar
                      </button>
                      {asiento.estado !== "anulado" && (
                        <button className="secondary-button danger" onClick={() => openAnular(asiento)} disabled={saving}>
                          <XCircle size={14} /> Anular
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && asientos.length === 0 && <EmptyRow colSpan={9} />}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "form" && (
        <div className="modal-backdrop">
          <form className="modal modal-wide" onSubmit={(event) => event.preventDefault()} data-tour="asientos-manuales-formulario">
            <div className="modal-header">
              <h3>{selected ? "Revisar asiento" : "Nuevo asiento manual"}</h3>
              <button type="button" onClick={() => setModal(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  Fecha
                  <input type="date" value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })} disabled={selected && selected.estado !== "borrador"} />
                </label>
                <label>
                  Tipo asiento
                  <select value={form.tipoAsiento} onChange={(event) => setForm({ ...form, tipoAsiento: event.target.value })} disabled={selected && selected.estado !== "borrador"}>
                    {TIPOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label className="full">
                  Concepto
                  <input value={form.concepto} onChange={(event) => setForm({ ...form, concepto: event.target.value })} disabled={selected && selected.estado !== "borrador"} />
                </label>
                <label className="full">
                  Observaciones
                  <textarea
                    value={form.observaciones}
                    onChange={(event) => setForm({ ...form, observaciones: event.target.value })}
                    disabled={selected && selected.estado !== "borrador"}
                    style={{ minHeight: 74 }}
                  />
                </label>
              </div>

              <div className="table-card" style={{ marginTop: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Cuenta contable</th>
                      <th>Descripcion</th>
                      <th>Debe</th>
                      <th>Haber</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineas.map((linea, index) => (
                      <tr key={`linea-${index}`}>
                        <td>
                          <select value={linea.cuentaId} onChange={(event) => updateLine(index, "cuentaId", event.target.value)} disabled={selected && selected.estado !== "borrador"}>
                            <option value="">Seleccionar cuenta</option>
                            {cuentas.map((cuenta) => (
                              <option key={cuenta.id} value={cuenta.id}>{cuenta.codigo} - {cuenta.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input value={linea.descripcion} onChange={(event) => updateLine(index, "descripcion", event.target.value)} disabled={selected && selected.estado !== "borrador"} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" value={linea.debe} onChange={(event) => updateLine(index, "debe", event.target.value)} disabled={selected && selected.estado !== "borrador"} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" value={linea.haber} onChange={(event) => updateLine(index, "haber", event.target.value)} disabled={selected && selected.estado !== "borrador"} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary-button danger"
                            onClick={() => setForm((prev) => ({ ...prev, lineas: prev.lineas.filter((_, current) => current !== index) }))}
                            disabled={(selected && selected.estado !== "borrador") || form.lineas.length <= 2}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="filters-bar" style={{ marginTop: 14 }}>
                <button type="button" className="secondary-button" onClick={() => setForm((prev) => ({ ...prev, lineas: [...prev.lineas, emptyLine()] }))} disabled={selected && selected.estado !== "borrador"}>
                  <Plus size={16} /> Agregar linea
                </button>
                <strong>Debe: {formatMoney(formTotals.totalDebe)}</strong>
                <strong>Haber: {formatMoney(formTotals.totalHaber)}</strong>
                <strong>Diferencia: {formatMoney(formTotals.diferencia)}</strong>
              </div>
              {formError && <div className="login-error">{formError}</div>}

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button>
                {(!selected || selected.estado === "borrador") && (
                  <>
                    <button type="button" className="secondary-button" onClick={() => saveForm("borrador")} disabled={saving || Boolean(formError)}>
                      Guardar borrador
                    </button>
                    <button type="button" className="primary-button" onClick={() => saveForm("confirmado")} disabled={saving || Boolean(formError)}>
                      Guardar y confirmar
                    </button>
                  </>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {modal === "anular" && selected && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Anular asiento</h3>
              <button type="button" onClick={() => setModal(null)}>x</button>
            </div>
            <div className="modal-body">
              <p className="muted">
                {selected.numero || selected.id} - {selected.concepto}
              </p>
              <label>
                Motivo de anulacion
                <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} style={{ minHeight: 90 }} />
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button>
                <button type="button" className="primary-button" onClick={anular} disabled={saving || !motivo.trim()}>
                  Confirmar anulacion
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
