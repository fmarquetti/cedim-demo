import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, FileSpreadsheet, FileText, Percent, ReceiptText, RefreshCw } from "lucide-react";

import {
  getResumenIva,
  getLibroIvaVentas,
  getLibroIvaCompras,
  calcularResumenIvaVentas,
  calcularResumenIvaCompras,
} from "../services/ivaService";
import {
  addPdfFooter,
  addPdfHeader,
  autoTable,
  ExcelJS,
  exportWorkbook,
  formatDate,
  formatMoney,
  jsPDF,
  safeFileName,
  styleWorkbook,
} from "../utils/reportUtils";

const VISTAS = {
  resumen: "Resumen",
  ventas: "IVA Ventas",
  compras: "IVA Compras",
};

const statusClass = (estado) =>
  String(estado || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");

function EmptyRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan}>No hay datos de IVA para los filtros seleccionados.</td>
    </tr>
  );
}

export default function Iva({ selectedSede, sedeId }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [vista, setVista] = useState("resumen");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [resumenVentas, setResumenVentas] = useState({
    netoGravado: 0,
    ivaDebito: 0,
    exento: 0,
    noGravado: 0,
    total: 0,
  });
  const [resumenCompras, setResumenCompras] = useState({
    netoGravado: 0,
    ivaCredito: 0,
    exento: 0,
    noGravado: 0,
    total: 0,
  });
  const [ivaDebito, setIvaDebito] = useState(0);
  const [ivaCredito, setIvaCredito] = useState(0);
  const [saldoIva, setSaldoIva] = useState(0);

  const selectedSedeName =
    typeof selectedSede === "object" && selectedSede !== null
      ? selectedSede.nombre
      : selectedSede || "Todas las sedes";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { desde, hasta, sedeId };

      if (vista === "resumen") {
        const data = await getResumenIva(params);
        setVentas(data.ventas || []);
        setCompras(data.compras || []);
        setResumenVentas(data.resumenVentas);
        setResumenCompras(data.resumenCompras);
        setIvaDebito(data.ivaDebito);
        setIvaCredito(data.ivaCredito);
        setSaldoIva(data.saldoIva);
        return;
      }

      const [ventasData, comprasData] = await Promise.all([
        getLibroIvaVentas(params),
        getLibroIvaCompras(params),
      ]);
      const resumenVentasData = calcularResumenIvaVentas(ventasData);
      const resumenComprasData = calcularResumenIvaCompras(comprasData);
      const debito = resumenVentasData.ivaDebito;
      const credito = resumenComprasData.ivaCredito;

      setVentas(ventasData || []);
      setCompras(comprasData || []);
      setResumenVentas(resumenVentasData);
      setResumenCompras(resumenComprasData);
      setIvaDebito(debito);
      setIvaCredito(credito);
      setSaldoIva(Number((debito - credito).toFixed(2)));
    } catch (err) {
      console.error("Error cargando IVA:", err);
      setError(err.message || "No se pudo cargar la información de IVA.");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, sedeId, vista]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const saldoLabel = useMemo(() => {
    if (saldoIva > 0) return "Saldo a pagar estimado";
    if (saldoIva < 0) return "Saldo técnico a favor estimado";
    return "Sin saldo estimado para el período";
  }, [saldoIva]);

  const nombreArchivo = useMemo(() => {
    const periodo =
      desde || hasta
        ? `${desde || "inicio"}_${hasta || "actual"}`
        : "todos_los_periodos";
    return `IVA_${safeFileName(VISTAS[vista])}_${safeFileName(periodo)}`;
  }, [desde, hasta, vista]);

  const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CEDIM - TECNEW";
    workbook.created = new Date();

    const resumen = workbook.addWorksheet("Resumen");
    resumen.columns = [
      { header: "Indicador", key: "indicador", width: 32 },
      { header: "Valor", key: "valor", width: 18 },
    ];
    resumen.addRows([
      { indicador: "Sede", valor: selectedSedeName },
      { indicador: "Desde", valor: desde ? formatDate(desde) : "Inicio" },
      { indicador: "Hasta", valor: hasta ? formatDate(hasta) : "Actual" },
      { indicador: "IVA débito fiscal", valor: ivaDebito },
      { indicador: "IVA crédito fiscal", valor: ivaCredito },
      { indicador: "Saldo IVA", valor: saldoIva },
      { indicador: "Total ventas", valor: resumenVentas.total },
      { indicador: "Total compras", valor: resumenCompras.total },
    ]);

    const ventasSheet = workbook.addWorksheet("IVA Ventas");
    ventasSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Tipo", key: "tipo", width: 22 },
      { header: "Comprobante", key: "comprobante", width: 18 },
      { header: "Cliente", key: "cliente", width: 30 },
      { header: "Documento", key: "documento", width: 18 },
      { header: "Neto gravado", key: "neto", width: 16 },
      { header: "IVA", key: "iva", width: 16 },
      { header: "No gravado", key: "noGravado", width: 16 },
      { header: "Total", key: "total", width: 16 },
      { header: "CAE", key: "cae", width: 18 },
      { header: "Estado", key: "estado", width: 16 },
    ];
    ventasSheet.addRows(
      ventas.map((row) => ({
        fecha: formatDate(row.fecha),
        tipo: row.tipoComprobanteLabel,
        comprobante: row.comprobante,
        cliente: row.clienteNombre,
        documento: row.clienteDocumento,
        neto: row.netoGravado,
        iva: row.iva,
        noGravado: row.noGravado,
        total: row.total,
        cae: row.cae,
        estado: row.estado,
      }))
    );

    const comprasSheet = workbook.addWorksheet("IVA Compras");
    comprasSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Tipo", key: "tipo", width: 22 },
      { header: "Comprobante", key: "comprobante", width: 18 },
      { header: "Proveedor", key: "proveedor", width: 30 },
      { header: "CUIT", key: "cuit", width: 18 },
      { header: "Categoría", key: "categoria", width: 20 },
      { header: "Neto gravado", key: "neto", width: 16 },
      { header: "IVA", key: "iva", width: 16 },
      { header: "No gravado", key: "noGravado", width: 16 },
      { header: "Total", key: "total", width: 16 },
      { header: "Estado", key: "estado", width: 16 },
    ];
    comprasSheet.addRows(
      compras.map((row) => ({
        fecha: formatDate(row.fecha),
        tipo: row.tipoComprobanteLabel,
        comprobante: row.comprobante,
        proveedor: row.proveedor,
        cuit: row.proveedorCuit,
        categoria: row.categoria,
        neto: row.netoGravado,
        iva: row.iva,
        noGravado: row.noGravado,
        total: row.total,
        estado: row.estado,
      }))
    );

    styleWorkbook(workbook);

    [
      resumen.getColumn("valor"),
      ventasSheet.getColumn("neto"),
      ventasSheet.getColumn("iva"),
      ventasSheet.getColumn("noGravado"),
      ventasSheet.getColumn("total"),
      comprasSheet.getColumn("neto"),
      comprasSheet.getColumn("iva"),
      comprasSheet.getColumn("noGravado"),
      comprasSheet.getColumn("total"),
    ].forEach((column) => {
      column.numFmt = '"$"#,##0.00';
    });

    await exportWorkbook(workbook, `${nombreArchivo}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF("landscape", "mm", "a4");
    const periodo = `Periodo: ${desde ? formatDate(desde) : "Inicio"} al ${hasta ? formatDate(hasta) : "Actual"} | Sede: ${selectedSedeName}`;

    addPdfHeader(doc, { title: VISTAS[vista], subtitle: periodo });

    if (vista === "resumen") {
      autoTable(doc, {
        startY: 42,
        head: [["Indicador", "Valor"]],
        body: [
          ["IVA debito fiscal", formatMoney(ivaDebito)],
          ["IVA credito fiscal", formatMoney(ivaCredito)],
          ["Saldo IVA", formatMoney(saldoIva)],
          ["Total ventas", formatMoney(resumenVentas.total)],
          ["Total compras", formatMoney(resumenCompras.total)],
          ["Neto gravado ventas", formatMoney(resumenVentas.netoGravado)],
          ["Neto gravado compras", formatMoney(resumenCompras.netoGravado)],
          ["No gravado ventas", formatMoney(resumenVentas.noGravado)],
          ["No gravado compras", formatMoney(resumenCompras.noGravado)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 58, 138] },
        columnStyles: { 1: { halign: "right" } },
      });
    }

    if (vista === "ventas") {
      autoTable(doc, {
        startY: 42,
        head: [["Fecha", "Tipo", "Comprobante", "Cliente", "Documento", "Neto gravado", "IVA", "No gravado", "Total", "CAE", "Estado"]],
        body: ventas.map((row) => [
          formatDate(row.fecha),
          row.tipoComprobanteLabel,
          row.comprobante,
          row.clienteNombre,
          row.clienteDocumento,
          formatMoney(row.netoGravado),
          formatMoney(row.iva),
          formatMoney(row.noGravado),
          formatMoney(row.total),
          row.cae,
          row.estado,
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 138] },
        columnStyles: { 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } },
      });
    }

    if (vista === "compras") {
      autoTable(doc, {
        startY: 42,
        head: [["Fecha", "Tipo", "Comprobante", "Proveedor", "CUIT", "Categoria", "Neto gravado", "IVA", "No gravado", "Total", "Estado"]],
        body: compras.map((row) => [
          formatDate(row.fecha),
          row.tipoComprobanteLabel,
          row.comprobante,
          row.proveedor,
          row.proveedorCuit,
          row.categoria,
          formatMoney(row.netoGravado),
          formatMoney(row.iva),
          formatMoney(row.noGravado),
          formatMoney(row.total),
          row.estado,
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 138] },
        columnStyles: { 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" } },
      });
    }

    addPdfFooter(doc);
    doc.save(`${nombreArchivo}.pdf`);
  };

  return (
    <section className="page">
      <div className="page-header" data-tour="iva-header">
        <div>
          <h2>IVA</h2>
          <p>Libro IVA compras, libro IVA ventas y resumen fiscal del período.</p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="secondary-button" onClick={exportarExcel} disabled={loading}>
            <FileSpreadsheet size={16} /> Exportar Excel
          </button>
          <button className="primary-button" onClick={exportarPDF} disabled={loading}>
            <FileText size={16} /> Exportar PDF
          </button>
        </div>
      </div>

      <div className="filters-bar" data-tour="iva-filtros">
        <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} />
        <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} />
        <select value={vista} onChange={(event) => setVista(event.target.value)} data-tour="iva-vista">
          {Object.entries(VISTAS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button className="secondary-button" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}

      {!error && loading && <p className="muted">Cargando información de IVA...</p>}

      {!error && !loading && vista === "resumen" && (
        <>
          <div className="stats-grid small" data-tour="iva-resumen">
            <div className="stat-card">
              <div>
                <span>IVA débito fiscal</span>
                <strong>{formatMoney(ivaDebito)}</strong>
                <small>{ventas.length} comprobantes de venta</small>
              </div>
              <ReceiptText size={22} />
            </div>
            <div className="stat-card">
              <div>
                <span>IVA crédito fiscal</span>
                <strong>{formatMoney(ivaCredito)}</strong>
                <small>{compras.length} comprobantes de compra</small>
              </div>
              <Percent size={22} />
            </div>
            <div className="stat-card">
              <div>
                <span>Saldo IVA</span>
                <strong>{formatMoney(saldoIva)}</strong>
                <small>{saldoLabel}</small>
              </div>
              <Calculator size={22} />
            </div>
            <div className="stat-card">
              <div>
                <span>Total ventas</span>
                <strong>{formatMoney(resumenVentas.total)}</strong>
                <small>Neto gravado {formatMoney(resumenVentas.netoGravado)}</small>
              </div>
              <ReceiptText size={22} />
            </div>
            <div className="stat-card">
              <div>
                <span>Total compras</span>
                <strong>{formatMoney(resumenCompras.total)}</strong>
                <small>Neto gravado {formatMoney(resumenCompras.netoGravado)}</small>
              </div>
              <FileSpreadsheet size={22} />
            </div>
          </div>

          <div className="panel" data-tour="iva-tabla">
            <h3>Resumen fiscal</h3>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Ventas</th>
                    <th>Compras</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Neto gravado</td>
                    <td>{formatMoney(resumenVentas.netoGravado)}</td>
                    <td>{formatMoney(resumenCompras.netoGravado)}</td>
                  </tr>
                  <tr>
                    <td>IVA</td>
                    <td>{formatMoney(ivaDebito)}</td>
                    <td>{formatMoney(ivaCredito)}</td>
                  </tr>
                  <tr>
                    <td>No gravado</td>
                    <td>{formatMoney(resumenVentas.noGravado)}</td>
                    <td>{formatMoney(resumenCompras.noGravado)}</td>
                  </tr>
                  <tr>
                    <td>Total</td>
                    <td>{formatMoney(resumenVentas.total)}</td>
                    <td>{formatMoney(resumenCompras.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!error && !loading && vista === "ventas" && (
        <div className="panel" data-tour="iva-tabla">
          <h3>Libro IVA Ventas</h3>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Comprobante</th>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Neto gravado</th>
                  <th>IVA</th>
                  <th>No gravado</th>
                  <th>Total</th>
                  <th>CAE</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.fecha)}</td>
                    <td>{row.tipoComprobanteLabel}</td>
                    <td>{row.comprobante}</td>
                    <td>{row.clienteNombre}</td>
                    <td>{row.clienteDocumento}</td>
                    <td>{formatMoney(row.netoGravado)}</td>
                    <td>{formatMoney(row.iva)}</td>
                    <td>{formatMoney(row.noGravado)}</td>
                    <td>{formatMoney(row.total)}</td>
                    <td>{row.cae}</td>
                    <td>
                      <span className={`status-badge ${statusClass(row.estado)}`}>
                        {row.estado}
                      </span>
                    </td>
                  </tr>
                ))}
                {ventas.length === 0 && <EmptyRow colSpan={11} />}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!error && !loading && vista === "compras" && (
        <div className="panel" data-tour="iva-tabla">
          <h3>Libro IVA Compras</h3>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Comprobante</th>
                  <th>Proveedor</th>
                  <th>CUIT</th>
                  <th>Categoría</th>
                  <th>Neto gravado</th>
                  <th>IVA</th>
                  <th>No gravado</th>
                  <th>Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.fecha)}</td>
                    <td>{row.tipoComprobanteLabel}</td>
                    <td>{row.comprobante}</td>
                    <td>{row.proveedor}</td>
                    <td>{row.proveedorCuit}</td>
                    <td>{row.categoria}</td>
                    <td>{formatMoney(row.netoGravado)}</td>
                    <td>{formatMoney(row.iva)}</td>
                    <td>{formatMoney(row.noGravado)}</td>
                    <td>{formatMoney(row.total)}</td>
                    <td>
                      <span className={`status-badge ${statusClass(row.estado)}`}>
                        {row.estado}
                      </span>
                    </td>
                  </tr>
                ))}
                {compras.length === 0 && <EmptyRow colSpan={11} />}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
