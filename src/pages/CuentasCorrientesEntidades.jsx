import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Printer, RefreshCw, Trash2 } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import Modal from "../components/Modal";
import { toast } from "../components/ToastProvider";
import {
  anularMovimientoCuentaCorriente,
  getEntidadesCuentaCorriente,
  getMovimientosCuentaCorriente,
  getResumenCuentasCorrientes,
} from "../services/cuentaCorrienteEntidadService";

const formatMoney = (value) =>
  `$ ${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) => {
  if (!value) return "-";
  const [yyyy, mm, dd] = String(value).split("-");
  return dd && mm && yyyy ? `${dd}/${mm}/${yyyy}` : value;
};

const safeFileName = (text) =>
  String(text || "cuenta_corriente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_");

export default function CuentasCorrientesEntidades({ selectedSede, sedeId }) {
  const [tipoEntidad, setTipoEntidad] = useState("cliente");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [search, setSearch] = useState("");
  const [resumen, setResumen] = useState([]);
  const [entidades, setEntidades] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [movimientosDetalle, setMovimientosDetalle] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [error, setError] = useState("");

  const selectedSedeName =
    typeof selectedSede === "object" && selectedSede !== null
      ? selectedSede.nombre
      : selectedSede || "Todas las sedes";

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [resumenData, entidadesData] = await Promise.all([
        getResumenCuentasCorrientes({ tipoEntidad, desde, hasta, sedeId }),
        getEntidadesCuentaCorriente({ tipo: tipoEntidad, search, activa: true }),
      ]);

      setResumen(resumenData || []);
      setEntidades(entidadesData || []);
    } catch (err) {
      console.error("Error cargando cuentas corrientes por entidad:", err);
      setError(err.message || "No se pudieron cargar las cuentas corrientes.");
      toast.error(err.message || "No se pudieron cargar las cuentas corrientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => loadData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoEntidad, desde, hasta, sedeId]);

  const resumenFiltrado = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return resumen;
    return resumen.filter(
      (item) =>
        item.nombre?.toLowerCase().includes(term) ||
        item.documento?.toLowerCase().includes(term)
    );
  }, [resumen, search]);

  const metricas = useMemo(() => {
    const totalDebe = resumenFiltrado.reduce((acc, item) => acc + item.totalDebe, 0);
    const totalHaber = resumenFiltrado.reduce((acc, item) => acc + item.totalHaber, 0);
    const saldo = resumenFiltrado.reduce((acc, item) => acc + item.saldo, 0);
    return {
      totalEntidades: resumenFiltrado.length,
      totalDebe,
      totalHaber,
      saldo,
      pendientes: resumenFiltrado.filter((item) => Math.abs(item.saldo) > 0.009).length,
    };
  }, [resumenFiltrado]);

  async function abrirDetalle(item) {
    setDetalle(item);
    setLoadingDetalle(true);

    try {
      const movimientos = await getMovimientosCuentaCorriente({
        entidadId: item.entidadId,
        tipoEntidad,
        desde,
        hasta,
        sedeId,
      });
      setMovimientosDetalle(movimientos || []);
    } catch (err) {
      console.error("Error cargando detalle de cuenta corriente:", err);
      toast.error(err.message || "No se pudo cargar el detalle.");
    } finally {
      setLoadingDetalle(false);
    }
  }

  async function handleAnularMovimiento(id) {
    if (!window.confirm("¿Anular este movimiento de cuenta corriente?")) return;
    await anularMovimientoCuentaCorriente(id);
    if (detalle) await abrirDetalle(detalle);
    await loadData();
  }

  async function exportarDetalleExcel() {
    if (!detalle) return;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Detalle");
    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Tipo", key: "tipoMovimiento", width: 18 },
      { header: "Descripcion", key: "descripcion", width: 42 },
      { header: "Comprobante", key: "comprobante", width: 22 },
      { header: "Vencimiento", key: "fechaVencimiento", width: 14 },
      { header: "Debe", key: "debe", width: 16 },
      { header: "Haber", key: "haber", width: 16 },
      { header: "Saldo", key: "saldo", width: 16 },
      { header: "Origen", key: "origen", width: 18 },
    ];

    movimientosDetalle.forEach((mov) => {
      sheet.addRow({ ...mov, fecha: formatDate(mov.fecha) });
    });

    sheet.getRow(1).font = { bold: true };
    ["debe", "haber", "saldo"].forEach((key) => {
      sheet.getColumn(key).numFmt = '"$"#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${safeFileName(detalle.nombre)}_cuenta_corriente.xlsx`
    );
  }

  return (
    <section className="page">
      <div className="page-header" data-tour="cc-entidades-header">
        <div>
          <h2>Cuentas Corrientes</h2>
          <p>Saldos por cliente y proveedor, facturas pendientes, cobros y pagos.</p>
        </div>

        <button className="secondary-button" type="button" onClick={loadData}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      <div className="filters-bar cc-entidades-filters" data-tour="cc-entidades-filtros">
        <select value={tipoEntidad} onChange={(e) => setTipoEntidad(e.target.value)}>
          <option value="cliente">Clientes</option>
          <option value="proveedor">Proveedores</option>
        </select>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <input
          placeholder="Buscar entidad o documento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          list="cc-entidades-lista"
        />
        <datalist id="cc-entidades-lista">
          {entidades.map((entidad) => (
            <option key={entidad.id} value={entidad.nombre} />
          ))}
        </datalist>
        <button className="secondary-button" type="button" onClick={loadData}>
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="stats-grid small" data-tour="cc-entidades-resumen">
        <div className="stat-card">
          <div>
            <span>Total entidades</span>
            <strong>{metricas.totalEntidades}</strong>
            <small>{selectedSedeName}</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>Total debe</span>
            <strong>{formatMoney(metricas.totalDebe)}</strong>
            <small>Deuda generada</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>Total haber</span>
            <strong>{formatMoney(metricas.totalHaber)}</strong>
            <small>Cobros y pagos aplicados</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>Saldo total</span>
            <strong>{formatMoney(metricas.saldo)}</strong>
            <small>{metricas.pendientes} entidades con saldo pendiente</small>
          </div>
        </div>
      </div>

      <div className="panel" data-tour="cc-entidades-tabla">
        <h3>Resumen por entidad</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Entidad</th>
                <th>Documento</th>
                <th>Total debe</th>
                <th>Total haber</th>
                <th>Saldo</th>
                <th>Cantidad movimientos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7">Cargando cuentas corrientes...</td>
                </tr>
              )}
              {!loading &&
                resumenFiltrado.map((item) => (
                  <tr key={item.entidadId}>
                    <td><strong>{item.nombre}</strong></td>
                    <td>{item.documento || "-"}</td>
                    <td>{formatMoney(item.totalDebe)}</td>
                    <td>{formatMoney(item.totalHaber)}</td>
                    <td>
                      <strong className={item.saldo > 0 ? "money-negative" : "money-positive"}>
                        {formatMoney(item.saldo)}
                      </strong>
                    </td>
                    <td>{item.cantidadMovimientos}</td>
                    <td>
                      <button className="secondary-button" type="button" onClick={() => abrirDetalle(item)}>
                        <Eye size={14} /> Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              {!loading && resumenFiltrado.length === 0 && (
                <tr>
                  <td colSpan="7">No hay saldos para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detalle && (
        <Modal title={`Cuenta corriente: ${detalle.nombre}`} onClose={() => setDetalle(null)}>
          <div data-tour="cc-entidades-detalle">
            <div className="stats-grid small detail-stats-grid">
              <div className="stat-card">
                <div>
                  <span>Entidad</span>
                  <strong>{detalle.nombre}</strong>
                  <small>{detalle.documento || "Sin documento"}</small>
                </div>
              </div>
              <div className="stat-card">
                <div>
                  <span>Tipo</span>
                  <strong>{detalle.tipoEntidad}</strong>
                  <small>{selectedSedeName}</small>
                </div>
              </div>
              <div className="stat-card">
                <div>
                  <span>Saldo</span>
                  <strong>{formatMoney(detalle.saldo)}</strong>
                  <small>Debe menos haber</small>
                </div>
              </div>
            </div>

            <div className="detail-actions">
              <button className="secondary-button" type="button" onClick={exportarDetalleExcel}>
                <Download size={14} /> Excel
              </button>
              <button className="secondary-button" type="button" onClick={() => window.print()}>
                <Printer size={14} /> Imprimir
              </button>
            </div>

            <div className="table-card detail-table-wrap">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo movimiento</th>
                    <th>Descripcion</th>
                    <th>Comprobante</th>
                    <th>Vencimiento</th>
                    <th>Debe</th>
                    <th>Haber</th>
                    <th>Saldo acumulado</th>
                    <th>Origen</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDetalle && (
                    <tr>
                      <td colSpan="10">Cargando movimientos...</td>
                    </tr>
                  )}
                  {!loadingDetalle &&
                    movimientosDetalle.map((mov) => (
                      <tr key={mov.id}>
                        <td>{formatDate(mov.fecha)}</td>
                        <td>{mov.tipoMovimiento}</td>
                        <td>{mov.descripcion}</td>
                        <td>{mov.comprobante || "-"}</td>
                        <td>{formatDate(mov.fechaVencimiento)}</td>
                        <td>{mov.debe ? formatMoney(mov.debe) : "-"}</td>
                        <td>{mov.haber ? formatMoney(mov.haber) : "-"}</td>
                        <td><strong>{formatMoney(mov.saldo)}</strong></td>
                        <td>{mov.origen}</td>
                        <td>
                          <button type="button" onClick={() => handleAnularMovimiento(mov.id)}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  {!loadingDetalle && movimientosDetalle.length === 0 && (
                    <tr>
                      <td colSpan="10">No hay movimientos para esta entidad.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
