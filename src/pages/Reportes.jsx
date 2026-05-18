import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  RefreshCw,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Banknote,
} from "lucide-react";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { getIngresos } from "../services/ingresoService";
import { getEgresos } from "../services/egresoService";
import { getMovimientosBancarios } from "../services/bancoService";
import { getCuentasCorrientes } from "../services/cuentaCorrienteService";

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

const toDate = (fecha) => {
  if (!fecha) return null;

  const clean = String(fecha).includes("T") ? fecha.split("T")[0] : fecha;

  if (clean.includes("/")) {
    const [day, month, year] = clean.split("/");
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }

  return new Date(`${clean}T00:00:00`);
};

const getFecha = (item) => item.fechaDb || item.fecha;

const safeFileName = (text) =>
  String(text || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_");

const filterByDate = (items, desde, hasta) => {
  const fechaDesde = toDate(desde);
  const fechaHasta = toDate(hasta);

  return items.filter((item) => {
    const fechaItem = toDate(getFecha(item));

    const matchDesde = !fechaDesde || (fechaItem && fechaItem >= fechaDesde);
    const matchHasta = !fechaHasta || (fechaItem && fechaItem <= fechaHasta);

    return matchDesde && matchHasta;
  });
};

const groupBySede = (ingresos, egresos) => {
  const map = {};

  ingresos.forEach((item) => {
    const sede = item.sede || "Sin sede";

    if (!map[sede]) {
      map[sede] = {
        sede,
        ingresos: 0,
        egresos: 0,
        resultado: 0,
      };
    }

    map[sede].ingresos += Number(item.importe || 0);
  });

  egresos.forEach((item) => {
    const sede = item.sede || "Sin sede";

    if (!map[sede]) {
      map[sede] = {
        sede,
        ingresos: 0,
        egresos: 0,
        resultado: 0,
      };
    }

    map[sede].egresos += Number(item.importe || 0);
  });

  return Object.values(map).map((item) => ({
    ...item,
    resultado: item.ingresos - item.egresos,
  }));
};

const isPendiente = (estado) => {
  const value = String(estado || "").toLowerCase();
  return !["cobrado", "pagado", "aplicado", "conciliado"].includes(value);
};

export default function Reportes({ selectedSede, sedeId }) {
  const [ingresos, setIngresos] = useState([]);
  const [egresos, setEgresos] = useState([]);
  const [movimientosBancarios, setMovimientosBancarios] = useState([]);
  const [cuentasCorrientes, setCuentasCorrientes] = useState([]);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipoReporte, setTipoReporte] = useState("Financiero general");

  const [loading, setLoading] = useState(true);

  const selectedSedeName =
    typeof selectedSede === "object" && selectedSede !== null
      ? selectedSede.nombre
      : selectedSede || "Todas las sedes";

  async function loadData(currentSedeId = sedeId) {
    setLoading(true);

    try {
      const idParaFiltro = currentSedeId === "todas" ? null : currentSedeId;

      const [ingresosData, egresosData, bancosData, cuentasData] =
        await Promise.all([
          getIngresos(idParaFiltro),
          getEgresos(idParaFiltro),
          getMovimientosBancarios(idParaFiltro),
          getCuentasCorrientes(idParaFiltro),
        ]);

      setIngresos(ingresosData || []);
      setEgresos(egresosData || []);
      setMovimientosBancarios(bancosData || []);
      setCuentasCorrientes(cuentasData || []);
    } catch (error) {
      console.error("Error cargando reportes:", error);
      alert("No se pudo cargar la información de reportes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(sedeId);
  }, [sedeId]);

  const ingresosFiltrados = useMemo(() => {
    return filterByDate(ingresos, desde, hasta);
  }, [ingresos, desde, hasta]);

  const egresosFiltrados = useMemo(() => {
    return filterByDate(egresos, desde, hasta);
  }, [egresos, desde, hasta]);

  const bancosFiltrados = useMemo(() => {
    return filterByDate(movimientosBancarios, desde, hasta);
  }, [movimientosBancarios, desde, hasta]);

  const cuentasFiltradas = useMemo(() => {
    return filterByDate(cuentasCorrientes, desde, hasta);
  }, [cuentasCorrientes, desde, hasta]);

  const resumenSedes = useMemo(
    () => groupBySede(ingresosFiltrados, egresosFiltrados),
    [ingresosFiltrados, egresosFiltrados]
  );

  const totalIngresos = ingresosFiltrados.reduce(
    (acc, item) => acc + Number(item.importe || 0),
    0
  );

  const totalEgresos = egresosFiltrados.reduce(
    (acc, item) => acc + Number(item.importe || 0),
    0
  );

  const resultado = totalIngresos - totalEgresos;

  const ingresosPendientes = ingresosFiltrados
    .filter((item) => isPendiente(item.estado))
    .reduce((acc, item) => acc + Number(item.importe || 0), 0);

  const egresosPendientes = egresosFiltrados
    .filter((item) => isPendiente(item.estado))
    .reduce((acc, item) => acc + Number(item.importe || 0), 0);

  const bancosPendientes = bancosFiltrados.filter((item) =>
    isPendiente(item.estado)
  );

  const cuentasVencidas = cuentasFiltradas.filter((item) => {
    if (!item.vencimiento) return false;

    return toDate(item.vencimiento) < toDate(new Date().toISOString().split("T")[0]) &&
      isPendiente(item.estado);
  });

  const totalCuentasVencidas = cuentasVencidas.reduce(
    (acc, item) => acc + Number(item.importe || 0),
    0
  );

  const nombreArchivo = useMemo(() => {
    const sede = selectedSedeName;
    const periodo =
      desde || hasta
        ? `${desde || "inicio"}_${hasta || "actual"}`
        : "todos_los_periodos";

    return `Reporte_${safeFileName(tipoReporte)}_${safeFileName(sede)}_${safeFileName(
      periodo
    )}`;
  }, [tipoReporte, selectedSedeName, desde, hasta]);

  const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CEDIM - TECNEW";
    workbook.created = new Date();

    const resumen = workbook.addWorksheet("Resumen");
    resumen.columns = [
      { header: "Indicador", key: "indicador", width: 35 },
      { header: "Valor", key: "valor", width: 20 },
    ];

    resumen.addRows([
      { indicador: "Sede", valor: selectedSedeName },
      { indicador: "Desde", valor: desde ? formatDate(desde) : "Inicio" },
      { indicador: "Hasta", valor: hasta ? formatDate(hasta) : "Actual" },
      { indicador: "Total ingresos", valor: totalIngresos },
      { indicador: "Total egresos", valor: totalEgresos },
      { indicador: "Resultado", valor: resultado },
      { indicador: "Ingresos pendientes", valor: ingresosPendientes },
      { indicador: "Egresos pendientes", valor: egresosPendientes },
      { indicador: "Conciliaciones pendientes", valor: bancosPendientes.length },
      { indicador: "Cuentas vencidas", valor: cuentasVencidas.length },
      { indicador: "Total cuentas vencidas", valor: totalCuentasVencidas },
    ]);

    const sedesSheet = workbook.addWorksheet("Resultado por sede");
    sedesSheet.columns = [
      { header: "Sede", key: "sede", width: 28 },
      { header: "Ingresos", key: "ingresos", width: 18 },
      { header: "Egresos", key: "egresos", width: 18 },
      { header: "Resultado", key: "resultado", width: 18 },
    ];
    sedesSheet.addRows(resumenSedes);

    const ingresosSheet = workbook.addWorksheet("Ingresos");
    ingresosSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Sede", key: "sede", width: 24 },
      { header: "Sociedad", key: "sociedad", width: 28 },
      { header: "Concepto", key: "concepto", width: 40 },
      { header: "Origen", key: "origen", width: 20 },
      { header: "Importe", key: "importe", width: 18 },
      { header: "Estado", key: "estado", width: 16 },
    ];
    ingresosSheet.addRows(
      ingresosFiltrados.map((item) => ({
        fecha: formatDate(getFecha(item)),
        sede: item.sede,
        sociedad: item.sociedad,
        concepto: item.concepto,
        origen: item.origen,
        importe: item.importe,
        estado: item.estado,
      }))
    );

    const egresosSheet = workbook.addWorksheet("Egresos");
    egresosSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Sede", key: "sede", width: 24 },
      { header: "Proveedor", key: "proveedor", width: 28 },
      { header: "Concepto", key: "concepto", width: 40 },
      { header: "Categoría", key: "categoria", width: 20 },
      { header: "Importe", key: "importe", width: 18 },
      { header: "Estado", key: "estado", width: 16 },
    ];
    egresosSheet.addRows(
      egresosFiltrados.map((item) => ({
        fecha: formatDate(getFecha(item)),
        sede: item.sede,
        proveedor: item.proveedor,
        concepto: item.concepto,
        categoria: item.categoria,
        importe: item.importe,
        estado: item.estado,
      }))
    );

    const bancosSheet = workbook.addWorksheet("Bancos");
    bancosSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Sede", key: "sede", width: 24 },
      { header: "Cuenta", key: "cuenta", width: 24 },
      { header: "Tipo", key: "tipo", width: 18 },
      { header: "Descripción", key: "descripcion", width: 40 },
      { header: "Importe", key: "importe", width: 18 },
      { header: "Estado", key: "estado", width: 16 },
    ];
    bancosSheet.addRows(
      bancosFiltrados.map((item) => ({
        fecha: formatDate(getFecha(item)),
        sede: item.sede,
        cuenta: item.cuenta,
        tipo: item.tipo,
        descripcion: item.descripcion,
        importe: item.importe,
        estado: item.estado,
      }))
    );

    const cuentasSheet = workbook.addWorksheet("Cuentas corrientes");
    cuentasSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Entidad", key: "entidad", width: 30 },
      { header: "Tipo entidad", key: "tipoEntidad", width: 18 },
      { header: "Sede", key: "sede", width: 24 },
      { header: "Comprobante", key: "comprobante", width: 18 },
      { header: "Número", key: "numero", width: 20 },
      { header: "Concepto", key: "concepto", width: 40 },
      { header: "Importe", key: "importe", width: 18 },
      { header: "Vencimiento", key: "vencimiento", width: 16 },
      { header: "Estado", key: "estado", width: 16 },
    ];
    cuentasSheet.addRows(
      cuentasFiltradas.map((item) => ({
        fecha: formatDate(item.fecha),
        entidad: item.entidad,
        tipoEntidad: item.tipoEntidad,
        sede: item.sede,
        comprobante: item.comprobante,
        numero: item.numero,
        concepto: item.concepto,
        importe: item.importe,
        vencimiento: formatDate(item.vencimiento),
        estado: item.estado,
      }))
    );

    workbook.worksheets.forEach((sheet) => {
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A8A" },
      };

      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } },
          };
        });
      });
    });

    [
      resumen.getColumn("valor"),
      sedesSheet.getColumn("ingresos"),
      sedesSheet.getColumn("egresos"),
      sedesSheet.getColumn("resultado"),
      ingresosSheet.getColumn("importe"),
      egresosSheet.getColumn("importe"),
      bancosSheet.getColumn("importe"),
      cuentasSheet.getColumn("importe"),
    ].forEach((column) => {
      column.numFmt = '"$"#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const data = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(data, `${nombreArchivo}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("CEDIM", 14, 16);

    doc.setFontSize(15);
    doc.text("Reporte financiero integral", 14, 26);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Reporte generado por plataforma creada por TECNEW", 14, 32);

    doc.setDrawColor(210);
    doc.line(14, 37, pageWidth - 14, 37);

    doc.setFontSize(9);
    doc.text(`Sede: ${selectedSedeName}`, 14, 44);
    doc.text(`Tipo de reporte: ${tipoReporte}`, 14, 49);
    doc.text(`Periodo: ${desde ? formatDate(desde) : "Inicio"} al ${hasta ? formatDate(hasta) : "Actual"}`, 14, 54);
    doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 14, 59);

    doc.setFont("helvetica", "bold");
    doc.text(`Ingresos: ${formatMoney(totalIngresos)}`, 155, 44);
    doc.text(`Egresos: ${formatMoney(totalEgresos)}`, 155, 49);
    doc.text(`Resultado: ${formatMoney(resultado)}`, 155, 54);
    doc.text(`Deuda vencida: ${formatMoney(totalCuentasVencidas)}`, 155, 59);

    autoTable(doc, {
      startY: 68,
      head: [["Sede", "Ingresos", "Egresos", "Resultado"]],
      body: resumenSedes.map((item) => [
        item.sede,
        formatMoney(item.ingresos),
        formatMoney(item.egresos),
        formatMoney(item.resultado),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Fecha", "Tipo", "Sede", "Detalle", "Importe", "Estado"]],
      body: [
        ...ingresosFiltrados.map((item) => [
          formatDate(getFecha(item)),
          "Ingreso",
          item.sede,
          item.concepto,
          formatMoney(item.importe),
          item.estado,
        ]),
        ...egresosFiltrados.map((item) => [
          formatDate(getFecha(item)),
          "Egreso",
          item.sede,
          item.concepto,
          formatMoney(item.importe),
          item.estado,
        ]),
      ],
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      columnStyles: {
        4: { halign: "right" },
      },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Entidad", "Tipo", "Sede", "Comprobante", "Vencimiento", "Importe", "Estado"]],
      body: cuentasVencidas.map((item) => [
        item.entidad,
        item.tipoEntidad,
        item.sede,
        `${item.comprobante} ${item.numero || ""}`,
        formatDate(item.vencimiento),
        formatMoney(item.importe),
        item.estado,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [127, 29, 29], textColor: 255 },
      columnStyles: {
        5: { halign: "right" },
      },
    });

    const pageCount = doc.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(130);

      doc.text("Generado por plataforma TECNEW", 14, pageHeight - 8);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - 35, pageHeight - 8);
    }

    doc.save(`${nombreArchivo}.pdf`);
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Reportes</h2>
          <p>Informes financieros reales generados desde Supabase.</p>
        </div>

        <button className="secondary-button" onClick={() => loadData(sedeId)} disabled={loading}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      <div className="stats-grid small">
        <div className="stat-card">
          <div>
            <span>Total ingresos</span>
            <strong>{formatMoney(totalIngresos)}</strong>
            <small>{ingresosFiltrados.length} registros</small>
          </div>
          <TrendingUp size={22} />
        </div>

        <div className="stat-card">
          <div>
            <span>Total egresos</span>
            <strong>{formatMoney(totalEgresos)}</strong>
            <small>{egresosFiltrados.length} registros</small>
          </div>
          <Wallet size={22} />
        </div>

        <div className="stat-card">
          <div>
            <span>Resultado</span>
            <strong>{formatMoney(resultado)}</strong>
            <small>{resultado >= 0 ? "Resultado positivo" : "Resultado negativo"}</small>
          </div>
          <Banknote size={22} />
        </div>

        <div className="stat-card">
          <div>
            <span>Deuda vencida</span>
            <strong>{formatMoney(totalCuentasVencidas)}</strong>
            <small>{cuentasVencidas.length} comprobantes vencidos</small>
          </div>
          <AlertTriangle size={22} />
        </div>
      </div>

      <div className="filters-bar">
        <select value={tipoReporte} onChange={(e) => setTipoReporte(e.target.value)}>
          <option>Financiero general</option>
          <option>Ingresos y egresos</option>
          <option>Cuentas corrientes</option>
          <option>Bancos y conciliaciones</option>
        </select>

        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />

        <button className="secondary-button" onClick={exportarExcel} disabled={loading}>
          <FileSpreadsheet size={16} /> Exportar Excel
        </button>

        <button className="primary-button" onClick={exportarPDF} disabled={loading}>
          <FileText size={16} /> Exportar PDF
        </button>
      </div>

      <div className="panel">
        <h3>Resultado por sede</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Sede</th>
                <th>Ingresos</th>
                <th>Egresos</th>
                <th>Resultado</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="4">Cargando reportes...</td>
                </tr>
              )}

              {!loading &&
                resumenSedes.map((item) => (
                  <tr key={item.sede}>
                    <td>{item.sede}</td>
                    <td>{formatMoney(item.ingresos)}</td>
                    <td>{formatMoney(item.egresos)}</td>
                    <td>
                      <strong>{formatMoney(item.resultado)}</strong>
                    </td>
                  </tr>
                ))}

              {!loading && resumenSedes.length === 0 && (
                <tr>
                  <td colSpan="4">No hay información para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="content-grid" style={{ marginTop: 18 }}>
        <div className="panel">
          <h3>Alertas financieras</h3>

          <div className="alert-item warning">
            <strong>{bancosPendientes.length} conciliaciones pendientes</strong>
            <span>Movimientos bancarios sin conciliar</span>
          </div>

          <div className="alert-item danger">
            <strong>{cuentasVencidas.length} cuentas vencidas</strong>
            <span>Total vencido: {formatMoney(totalCuentasVencidas)}</span>
          </div>

          <div className="alert-item info">
            <strong>{formatMoney(ingresosPendientes)} ingresos pendientes</strong>
            <span>Comprobantes aún no cobrados</span>
          </div>

          <div className="alert-item info">
            <strong>{formatMoney(egresosPendientes)} egresos pendientes</strong>
            <span>Comprobantes aún no pagados</span>
          </div>
        </div>

        <div className="panel">
          <h3>Contenido del reporte</h3>

          <div className="detail-grid">
            <div>
              <span>Ingresos</span>
              <strong>{ingresosFiltrados.length}</strong>
            </div>

            <div>
              <span>Egresos</span>
              <strong>{egresosFiltrados.length}</strong>
            </div>

            <div>
              <span>Bancos</span>
              <strong>{bancosFiltrados.length}</strong>
            </div>

            <div>
              <span>Cuentas corrientes</span>
              <strong>{cuentasFiltradas.length}</strong>
            </div>

            <div className="full document-preview">
              El reporte exportado incluye resumen ejecutivo, resultado por sede,
              detalle financiero y alertas de deuda vencida.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}