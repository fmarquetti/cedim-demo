import { useCallback, useEffect, useMemo, useState } from "react";
import { BookPlus, RefreshCw, ShieldCheck, Trash2, XCircle, Plus } from "lucide-react";

import {
  anularSaldosIniciales,
  confirmarSaldosIniciales,
  getCuentasContables,
  getFechasAperturaDisponibles,
  getSaldosIniciales,
  guardarSaldosIniciales,
} from "../services/contabilidadService";
import { formatDate, formatMoney } from "../utils/reportUtils";

const emptyLine = () => ({ cuentaId: "", descripcion: "", debe: "", haber: "" });
const today = () => new Date().toISOString().split("T")[0];
const money = (value) => Number(Number(value || 0).toFixed(2));

function getTotals(lineas) {
  const totalDebe = money(lineas.reduce((acc, linea) => acc + Number(linea.debe || 0), 0));
  const totalHaber = money(lineas.reduce((acc, linea) => acc + Number(linea.haber || 0), 0));
  return { totalDebe, totalHaber, diferencia: money(totalDebe - totalHaber) };
}

function getLineError(lineas) {
  if (!lineas.length) return "Debe cargar al menos una linea.";
  if (lineas.length < 2) return "Debe cargar al menos 2 lineas.";

  for (const [index, linea] of lineas.entries()) {
    const debe = Number(linea.debe || 0);
    const haber = Number(linea.haber || 0);
    if (!linea.cuentaId) return `La linea ${index + 1} no tiene cuenta.`;
    if (debe < 0 || haber < 0) return `La linea ${index + 1} tiene importes negativos.`;
    if (debe > 0 && haber > 0) return `La linea ${index + 1} tiene debe y haber simultaneos.`;
    if (debe === 0 && haber === 0) return `La linea ${index + 1} debe tener importe.`;
  }

  const totals = getTotals(lineas);
  if (Math.abs(totals.diferencia) > 0.01) return "Los saldos iniciales no balancean.";
  return "";
}

export default function SaldosIniciales({ selectedSede, sedeId, currentUser }) {
  const [fechaApertura, setFechaApertura] = useState(today());
  const [fechas, setFechas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [lineas, setLineas] = useState([emptyLine(), emptyLine()]);
  const [saldos, setSaldos] = useState([]);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  void selectedSede;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [cuentasData, fechasData, saldosData] = await Promise.all([
        getCuentasContables(),
        getFechasAperturaDisponibles(),
        getSaldosIniciales({ fechaApertura, sedeId }),
      ]);

      setCuentas((cuentasData || []).filter((cuenta) => cuenta.imputable && cuenta.activa));
      setFechas(fechasData || []);
      setSaldos(saldosData || []);
    } catch (err) {
      console.error("Error cargando saldos iniciales:", err);
      setError(err.message || "No se pudieron cargar los saldos iniciales.");
    } finally {
      setLoading(false);
    }
  }, [fechaApertura, sedeId]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const totals = useMemo(() => getTotals(lineas), [lineas]);
  const formError = useMemo(() => getLineError(lineas), [lineas]);
  const saldosConfirmados = saldos.filter((saldo) => saldo.estado === "confirmado");
  const asientoGenerado = saldos.find((saldo) => saldo.asientoId)?.asientoId || "";
  const estado = saldosConfirmados.length ? "confirmado" : saldos.some((saldo) => saldo.estado === "borrador") ? "borrador" : "sin cargar";

  const updateLine = (index, field, value) => {
    setLineas((prev) =>
      prev.map((linea, currentIndex) =>
        currentIndex === index ? { ...linea, [field]: value } : linea
      )
    );
  };

  const cargarDesdeGuardados = () => {
    const borradores = saldos.filter((saldo) => saldo.estado === "borrador");
    const base = borradores.length ? borradores : saldos;

    if (!base.length) {
      setLineas([emptyLine(), emptyLine()]);
      return;
    }

    setLineas(base.map((saldo) => ({
      cuentaId: saldo.cuentaId,
      descripcion: saldo.descripcion || "",
      debe: saldo.debe || "",
      haber: saldo.haber || "",
    })));
  };

  const guardar = async () => {
    if (!fechaApertura) {
      setError("La fecha de apertura es obligatoria.");
      return;
    }

    if (formError) {
      setError(formError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const data = await guardarSaldosIniciales({
        fechaApertura,
        sedeId,
        createdBy: currentUser?.id || null,
        lineas: lineas.map((linea) => ({
          ...linea,
          debe: money(linea.debe),
          haber: money(linea.haber),
        })),
      });
      setSaldos(data || []);
      setFechas(await getFechasAperturaDisponibles());
    } catch (err) {
      console.error("Error guardando saldos iniciales:", err);
      setError(err.message || "No se pudieron guardar los saldos iniciales.");
    } finally {
      setSaving(false);
    }
  };

  const confirmar = async () => {
    if (formError) {
      setError(formError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      await guardarSaldosIniciales({
        fechaApertura,
        sedeId,
        lineas: lineas.map((linea) => ({
          ...linea,
          debe: money(linea.debe),
          haber: money(linea.haber),
        })),
      });

      const result = await confirmarSaldosIniciales({ fechaApertura, sedeId });
      setSaldos(result.saldos || []);
      setFechas(await getFechasAperturaDisponibles());
    } catch (err) {
      console.error("Error confirmando saldos iniciales:", err);
      setError(err.message || "No se pudieron confirmar los saldos iniciales.");
    } finally {
      setSaving(false);
    }
  };

  const anular = async () => {
    if (!motivoAnulacion.trim()) {
      setError("El motivo de anulacion es obligatorio.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const data = await anularSaldosIniciales({ fechaApertura, sedeId, motivo: motivoAnulacion });
      setSaldos(data || []);
      setMotivoAnulacion("");
    } catch (err) {
      console.error("Error anulando saldos iniciales:", err);
      setError(err.message || "No se pudieron anular los saldos iniciales.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <div className="page-header" data-tour="saldos-iniciales-header">
        <div>
          <h2>Saldos Iniciales</h2>
          <p>Carga de saldos de apertura para iniciar la contabilidad desde una fecha determinada.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={loadData} disabled={loading || saving}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      <div className="filters-bar" data-tour="saldos-iniciales-configuracion">
        <input type="date" value={fechaApertura} onChange={(event) => setFechaApertura(event.target.value)} />
        <select value={fechaApertura} onChange={(event) => setFechaApertura(event.target.value)}>
          <option value={fechaApertura}>Fecha seleccionada</option>
          {fechas.filter((fecha) => fecha !== fechaApertura).map((fecha) => (
            <option key={fecha} value={fecha}>{formatDate(fecha)}</option>
          ))}
        </select>
        <button className="secondary-button" onClick={cargarDesdeGuardados} disabled={loading || saving}>
          <RefreshCw size={16} /> Cargar saldos
        </button>
        <button className="secondary-button" onClick={guardar} disabled={saving || Boolean(formError) || estado === "confirmado"}>
          <BookPlus size={16} /> Guardar borrador
        </button>
        <button className="primary-button" onClick={confirmar} disabled={saving || Boolean(formError) || estado === "confirmado"}>
          <ShieldCheck size={16} /> Confirmar apertura
        </button>
      </div>

      {estado === "confirmado" && (
        <div className="filters-bar">
          <input
            value={motivoAnulacion}
            onChange={(event) => setMotivoAnulacion(event.target.value)}
            placeholder="Motivo de anulacion"
          />
          <button className="secondary-button danger" onClick={anular} disabled={saving || !motivoAnulacion.trim()}>
            <XCircle size={16} /> Anular saldos iniciales
          </button>
        </div>
      )}

      {error && <div className="login-error">{error}</div>}
      {loading && <div className="panel"><p className="muted">Cargando saldos iniciales...</p></div>}

      <div className="stats-grid small" data-tour="saldos-iniciales-resumen">
        {[
          ["Total debe", formatMoney(totals.totalDebe)],
          ["Total haber", formatMoney(totals.totalHaber)],
          ["Diferencia", formatMoney(totals.diferencia)],
          ["Estado", estado],
          ["Asiento generado", asientoGenerado ? asientoGenerado.slice(0, 8) : "-"],
        ].map(([label, value]) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
            <BookPlus size={22} />
          </div>
        ))}
      </div>

      <div className="panel" data-tour="saldos-iniciales-formulario">
        <h3>Carga de apertura</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Cuenta contable</th>
                <th>Descripcion</th>
                <th>Debe</th>
                <th>Haber</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((linea, index) => (
                <tr key={`saldo-${index}`}>
                  <td>
                    <select value={linea.cuentaId} onChange={(event) => updateLine(index, "cuentaId", event.target.value)} disabled={estado === "confirmado"}>
                      <option value="">Seleccionar cuenta</option>
                      {cuentas.map((cuenta) => (
                        <option key={cuenta.id} value={cuenta.id}>{cuenta.codigo} - {cuenta.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={linea.descripcion} onChange={(event) => updateLine(index, "descripcion", event.target.value)} disabled={estado === "confirmado"} />
                  </td>
                  <td>
                    <input type="number" min="0" step="0.01" value={linea.debe} onChange={(event) => updateLine(index, "debe", event.target.value)} disabled={estado === "confirmado"} />
                  </td>
                  <td>
                    <input type="number" min="0" step="0.01" value={linea.haber} onChange={(event) => updateLine(index, "haber", event.target.value)} disabled={estado === "confirmado"} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button danger"
                      onClick={() => setLineas((prev) => prev.filter((_, current) => current !== index))}
                      disabled={estado === "confirmado" || lineas.length <= 2}
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="filters-bar totals-bar">
          <button type="button" className="secondary-button" onClick={() => setLineas((prev) => [...prev, emptyLine()])} disabled={estado === "confirmado"}>
            <Plus size={16} /> Agregar linea
          </button>
          <strong>Debe: {formatMoney(totals.totalDebe)}</strong>
          <strong>Haber: {formatMoney(totals.totalHaber)}</strong>
          <strong>Diferencia: {formatMoney(totals.diferencia)}</strong>
        </div>
        {formError && <p className="muted">{formError}</p>}
      </div>

      <div className="panel" data-tour="saldos-iniciales-tabla">
        <h3>Saldos guardados</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Codigo cuenta</th>
                <th>Cuenta</th>
                <th>Descripcion</th>
                <th>Debe</th>
                <th>Haber</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {!loading && saldos.map((saldo) => (
                <tr key={saldo.id}>
                  <td>{saldo.cuentaCodigo}</td>
                  <td>{saldo.cuentaNombre}</td>
                  <td>{saldo.descripcion || "-"}</td>
                  <td>{formatMoney(saldo.debe)}</td>
                  <td>{formatMoney(saldo.haber)}</td>
                  <td><span className={`status-badge ${saldo.estado}`}>{saldo.estado}</span></td>
                </tr>
              ))}
              {!loading && saldos.length === 0 && (
                <tr>
                  <td colSpan={6}>No hay saldos iniciales para la fecha seleccionada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
