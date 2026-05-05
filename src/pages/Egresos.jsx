// src/pages/Egresos.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Upload,
  ExternalLink,
  CheckCircle,
  RefreshCw,
  FileText,
  FileSpreadsheet,
} from "lucide-react";

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import jsQR from "jsqr";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Modal from "../components/Modal";
import {
  createEgreso,
  deleteEgreso,
  getEgresos,
  marcarEgresoPagado,
} from "../services/egresoService";
import { getSedes } from "../services/sedeService";
import { formatMoney, formatDate, toDate } from "../utils/format";
import { toast } from "../components/ToastProvider";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const CATEGORIAS = [
  "Insumos", "Reactivos", "Servicios", "Sueldos", "Alquileres", "Mantenimiento",
];

const emptyForm = {
  fecha: new Date().toISOString().split("T")[0],
  proveedor: "",
  sociedad: "",
  sedeId: "",
  concepto: "",
  importe: "",
  categoria: "Insumos",
  estado: "Pendiente",
};

const getFechaReal = (item) => item?.fechaDb || item?.fecha;

const safeFileName = (text) =>
  String(text || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_");

function decodeBase64Url(base64Url) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const jsonString = decodeURIComponent(escape(atob(padded)));
  return JSON.parse(jsonString);
}

function extraerDatosQRFiscal(qrText) {
  const url = new URL(qrText);
  const p = url.searchParams.get("p");
  if (!p) throw new Error("El QR no contiene datos fiscales válidos.");
  return decodeBase64Url(p);
}

function tipoComprobanteLabel(codigo) {
  const tipos = {
    1: "Factura A", 2: "Nota de Débito A", 3: "Nota de Crédito A",
    6: "Factura B", 7: "Nota de Débito B", 8: "Nota de Crédito B",
    11: "Factura C", 12: "Nota de Débito C", 13: "Nota de Crédito C",
    51: "Factura M",
  };
  return tipos[codigo] || `Comprobante ${codigo}`;
}

function formatFechaInput(fecha) {
  if (!fecha) return "";
  if (fecha.includes("-")) return fecha;
  const [dd, mm, yyyy] = fecha.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Egresos({ selectedSede, sedeId }) {
  const facturaInputRef = useRef(null);

  const [egresos, setEgresos] = useState([]);
  const [sedes, setSedes] = useState([]);

  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");
  const [sociedadFiltro, setSociedadFiltro] = useState("Todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [modal, setModal] = useState(null);
  const [importandoFactura, setImportandoFactura] = useState(false);
  const [egresoPendiente, setEgresoPendiente] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function loadData(currentSedeId = sedeId) {
    setLoading(true);
    try {
      const idParaFiltro = currentSedeId === "todas" ? null : currentSedeId;

      const [egresosData, sedesData] = await Promise.all([
        getEgresos(idParaFiltro),
        getSedes(),
      ]);

      setEgresos(egresosData || []);
      setSedes(sedesData || []);
      setForm((prev) => ({
        ...prev,
        sedeId: prev.sedeId || sedesData?.[0]?.id || "",
      }));
    } catch (error) {
      toast.error(error.message || "No se pudieron cargar los egresos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(sedeId);
  }, [sedeId]);

  const categorias = useMemo(() => {
    return [...new Set(egresos.map((item) => item.categoria).filter(Boolean))].sort();
  }, [egresos]);

  const sociedades = useMemo(() => {
    return [...new Set(egresos.map((item) => item.sociedad).filter(Boolean))].sort();
  }, [egresos]);

  const egresosFiltrados = useMemo(() => {
    const searchValue = search.toLowerCase().trim();
    const fechaDesde = toDate(desde);
    const fechaHasta = toDate(hasta);

    const egresosPorSede = egresos;

    return egresosPorSede.filter((item) => {
      const fechaItem = toDate(getFechaReal(item));
      const matchSearch =
        !searchValue ||
        item.proveedor?.toLowerCase().includes(searchValue) ||
        item.sociedad?.toLowerCase().includes(searchValue) ||
        item.sede?.toLowerCase().includes(searchValue) ||
        item.concepto?.toLowerCase().includes(searchValue) ||
        item.categoria?.toLowerCase().includes(searchValue) ||
        item.comprobante?.toLowerCase().includes(searchValue);

      const matchEstado = estadoFiltro === "Todos" || item.estado === estadoFiltro;
      const matchCategoria = categoriaFiltro === "Todas" || item.categoria === categoriaFiltro;
      const matchSociedad = sociedadFiltro === "Todas" || item.sociedad === sociedadFiltro;
      const matchDesde = !fechaDesde || (fechaItem && fechaItem >= fechaDesde);
      const matchHasta = !fechaHasta || (fechaItem && fechaItem <= fechaHasta);

      return matchSearch && matchEstado && matchCategoria && matchSociedad && matchDesde && matchHasta;
    });
  }, [egresos, search, estadoFiltro, categoriaFiltro, sociedadFiltro, desde, hasta]);

  const totalFiltrado = egresosFiltrados.reduce((acc, item) => acc + Number(item.importe || 0), 0);
  const totalPagado = egresosFiltrados.filter((e) => e.estado === "Pagado").reduce((acc, e) => acc + Number(e.importe || 0), 0);
  const totalPendiente = egresosFiltrados.filter((e) => e.estado === "Pendiente").reduce((acc, e) => acc + Number(e.importe || 0), 0);
  const comprobantesFiscales = egresosFiltrados.filter((item) => item.datosFiscales?.qrUrl);

  const resumenPorCategoria = useMemo(() => {
    const map = {};
    egresosFiltrados.forEach((item) => {
      const categoria = item.categoria || "Sin categoría";
      if (!map[categoria]) map[categoria] = { categoria, total: 0, pagado: 0, pendiente: 0, cantidad: 0 };
      map[categoria].total += Number(item.importe || 0);
      map[categoria].cantidad += 1;
      if (item.estado === "Pagado") map[categoria].pagado += Number(item.importe || 0);
      else map[categoria].pendiente += Number(item.importe || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [egresosFiltrados]);

  const nombreArchivo = useMemo(() => {
    const sede = typeof selectedSede === "object" && selectedSede !== null
      ? selectedSede.nombre : selectedSede || "Todas las sedes";
    const periodo = desde || hasta
      ? `${desde || "inicio"}_${hasta || "actual"}`
      : "todos_los_periodos";
    return `Egresos_${safeFileName(sede)}_${safeFileName(periodo)}`;
  }, [selectedSede, desde, hasta]);

  function aplicarFiltroRapido(tipo) {
    const hoy = new Date();
    const isoHoy = hoy.toISOString().split("T")[0];
    if (tipo === "hoy") { setDesde(isoHoy); setHasta(isoHoy); }
    if (tipo === "mes") {
      setDesde(new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0]);
      setHasta(isoHoy);
    }
    if (tipo === "pendientes") setEstadoFiltro("Pendiente");
    if (tipo === "limpiar") {
      setSearch(""); setEstadoFiltro("Todos"); setCategoriaFiltro("Todas");
      setSociedadFiltro("Todas"); setDesde(""); setHasta("");
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createEgreso(form);
      await loadData();
      setForm({ ...emptyForm, sedeId: sedes[0]?.id || "" });
      setModal(null);
      toast.success("Egreso guardado correctamente.");
    } catch (error) {
      toast.error(error.message || "No se pudo crear el egreso.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("¿Eliminar este egreso?")) return;
    setDeletingId(id);
    try {
      await deleteEgreso(id);
      await loadData();
      toast.success("Egreso eliminado.");
    } catch (error) {
      toast.error(error.message || "No se pudo eliminar el egreso.");
    } finally {
      setDeletingId(null);
    }
  }

  async function marcarPagado(id) {
    try {
      await marcarEgresoPagado(id);
      await loadData();
      toast.success("Egreso marcado como pagado.");
    } catch (error) {
      toast.error(error.message || "No se pudo marcar como pagado.");
    }
  }

  async function leerQRDesdePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imageData.data, canvas.width, canvas.height);
      if (qr?.data) return qr.data;
    }
    throw new Error("No se encontró ningún código QR en el PDF.");
  }

  async function importarFacturaFiscal(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportandoFactura(true);
      const qrText = await leerQRDesdePDF(file);
      const datos = extraerDatosQRFiscal(qrText);
      const tipoComprobante = tipoComprobanteLabel(datos.tipoCmp);
      const puntoVenta = String(datos.ptoVta || "").padStart(4, "0");
      const numeroComprobante = String(datos.nroCmp || "").padStart(8, "0");

      const nombreSede = typeof selectedSede === "object" && selectedSede !== null
        ? selectedSede.nombre : selectedSede;
      const sedeDefault = nombreSede && nombreSede !== "Todas las sedes"
        ? sedes.find((s) => s.nombre === nombreSede) : sedes[0];

      setEgresoPendiente({
        fecha: formatFechaInput(datos.fecha),
        proveedor: `CUIT ${datos.cuit}`,
        sociedad: "",
        sedeId: sedeDefault?.id || "",
        concepto: "",
        importe: Number(datos.importe || 0),
        categoria: "Insumos",
        estado: "Pendiente",
        archivo: file.name,
        comprobante: `${tipoComprobante} ${puntoVenta}-${numeroComprobante}`,
        datosFiscales: { ...datos, qrUrl: qrText, tipoComprobante, puntoVenta, numeroComprobante },
      });
      setModal("revisarFactura");
    } catch (error) {
      toast.error(error.message || "No se pudo importar la factura.");
    } finally {
      setImportandoFactura(false);
      e.target.value = "";
    }
  }

  async function confirmarEgresoImportado(e) {
    e.preventDefault();
    if (!egresoPendiente.concepto.trim()) {
      toast.error("Debés cargar el concepto antes de guardar el egreso.");
      return;
    }
    if (!egresoPendiente.proveedor.trim()) {
      toast.error("Debés cargar el proveedor antes de guardar el egreso.");
      return;
    }
    setSaving(true);
    try {
      await createEgreso(egresoPendiente);
      await loadData();
      setEgresoPendiente(null);
      setModal(null);
      toast.success("Factura importada y guardada correctamente.");
    } catch (error) {
      toast.error(error.message || "No se pudo guardar el egreso importado.");
    } finally {
      setSaving(false);
    }
  }

  function verAfip(qrUrl) {
    if (!qrUrl) { toast.error("Este comprobante no tiene URL fiscal disponible."); return; }
    window.open(qrUrl, "_blank", "noopener,noreferrer");
  }

  const exportarExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Genetics - TECNEW";
      workbook.created = new Date();

      const resumenSheet = workbook.addWorksheet("Resumen");
      resumenSheet.columns = [
        { header: "Indicador", key: "indicador", width: 34 },
        { header: "Valor", key: "valor", width: 20 },
      ];
      resumenSheet.addRows([
        { indicador: "Sede", valor: typeof selectedSede === "object" ? selectedSede?.nombre : selectedSede || "Todas las sedes" },
        { indicador: "Desde", valor: desde ? formatDate(desde) : "Inicio" },
        { indicador: "Hasta", valor: hasta ? formatDate(hasta) : "Actual" },
        { indicador: "Total egresos", valor: totalFiltrado },
        { indicador: "Total pagado", valor: totalPagado },
        { indicador: "Total pendiente", valor: totalPendiente },
        { indicador: "Comprobantes fiscales", valor: comprobantesFiscales.length },
      ]);

      const categoriaSheet = workbook.addWorksheet("Resumen por categoría");
      categoriaSheet.columns = [
        { header: "Categoría", key: "categoria", width: 28 },
        { header: "Total", key: "total", width: 18 },
        { header: "Pagado", key: "pagado", width: 18 },
        { header: "Pendiente", key: "pendiente", width: 18 },
        { header: "Cantidad", key: "cantidad", width: 14 },
      ];
      categoriaSheet.addRows(resumenPorCategoria);

      const detalleSheet = workbook.addWorksheet("Egresos");
      detalleSheet.columns = [
        { header: "Fecha", key: "fecha", width: 14 },
        { header: "Proveedor", key: "proveedor", width: 30 },
        { header: "Sociedad", key: "sociedad", width: 28 },
        { header: "Sede", key: "sede", width: 24 },
        { header: "Concepto", key: "concepto", width: 40 },
        { header: "Categoría", key: "categoria", width: 20 },
        { header: "Comprobante", key: "comprobante", width: 28 },
        { header: "Importe", key: "importe", width: 18 },
        { header: "Estado", key: "estado", width: 16 },
        { header: "Fiscal", key: "fiscal", width: 12 },
      ];
      detalleSheet.addRows(
        egresosFiltrados.map((item) => ({
          fecha: formatDate(getFechaReal(item)),
          proveedor: item.proveedor,
          sociedad: item.sociedad,
          sede: item.sede,
          concepto: item.concepto,
          categoria: item.categoria,
          comprobante: item.comprobante || "-",
          importe: item.importe,
          estado: item.estado,
          fiscal: item.datosFiscales?.qrUrl ? "Sí" : "No",
        }))
      );

      workbook.worksheets.forEach((sheet) => {
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
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

      [resumenSheet.getColumn("valor"), categoriaSheet.getColumn("total"), categoriaSheet.getColumn("pagado"), categoriaSheet.getColumn("pendiente"), detalleSheet.getColumn("importe")].forEach((col) => {
        col.numFmt = '"$"#,##0.00';
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${nombreArchivo}.xlsx`);
      toast.success("Excel exportado correctamente.");
    } catch (error) {
      toast.error("No se pudo exportar a Excel.");
    }
  };

  const exportarPDF = () => {
    try {
      const doc = new jsPDF("landscape", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const sedeName = typeof selectedSede === "object" ? selectedSede?.nombre : selectedSede || "Todas las sedes";

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("GENETICS", 14, 16);
      doc.setFontSize(15);
      doc.text("Reporte de egresos", 14, 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Reporte generado por plataforma creada por TECNEW", 14, 32);
      doc.setDrawColor(210);
      doc.line(14, 37, pageWidth - 14, 37);
      doc.text(`Sede: ${sedeName}`, 14, 44);
      doc.text(`Estado: ${estadoFiltro}`, 14, 49);
      doc.text(`Categoría: ${categoriaFiltro}`, 14, 54);
      doc.text(`Periodo: ${desde ? formatDate(desde) : "Inicio"} al ${hasta ? formatDate(hasta) : "Actual"}`, 14, 59);
      doc.setFont("helvetica", "bold");
      doc.text(`Total: ${formatMoney(totalFiltrado)}`, 155, 44);
      doc.text(`Pagado: ${formatMoney(totalPagado)}`, 155, 49);
      doc.text(`Pendiente: ${formatMoney(totalPendiente)}`, 155, 54);
      doc.text(`Fiscales: ${comprobantesFiscales.length}`, 155, 59);

      autoTable(doc, {
        startY: 68,
        head: [["Categoría", "Total", "Pagado", "Pendiente", "Cant."]],
        body: resumenPorCategoria.map((item) => [item.categoria, formatMoney(item.total), formatMoney(item.pagado), formatMoney(item.pendiente), item.cantidad]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "center" } },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [["Fecha", "Proveedor", "Sociedad", "Sede", "Concepto", "Categoría", "Importe", "Estado"]],
        body: egresosFiltrados.map((item) => [formatDate(getFechaReal(item)), item.proveedor, item.sociedad, item.sede, item.concepto, item.categoria, formatMoney(item.importe), item.estado]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        columnStyles: { 6: { halign: "right" } },
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
      toast.success("PDF exportado correctamente.");
    } catch (error) {
      toast.error("No se pudo exportar a PDF.");
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Egresos</h2>
          <p>Control de proveedores, gastos operativos, reactivos e insumos.</p>
        </div>
        <div className="header-actions">
          <input ref={facturaInputRef} type="file" accept="application/pdf" hidden onChange={importarFacturaFiscal} />
          <button className="secondary-button" onClick={() => loadData(sedeId)} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="secondary-button" onClick={() => facturaInputRef.current?.click()} disabled={importandoFactura}>
            <Upload size={16} />{importandoFactura ? "Leyendo factura..." : "Importar factura PDF"}
          </button>
          <button className="primary-button" onClick={() => setModal("nuevo")}><Plus size={16} /> Nuevo egreso</button>
        </div>
      </div>

      <div className="stats-grid small">
        <div className="stat-card"><div><span>Total egresos</span><strong>{formatMoney(totalFiltrado)}</strong><small>{egresosFiltrados.length} registros filtrados</small></div></div>
        <div className="stat-card"><div><span>Total pagado</span><strong>{formatMoney(totalPagado)}</strong><small>Egresos confirmados</small></div></div>
        <div className="stat-card"><div><span>Pendiente de pago</span><strong>{formatMoney(totalPendiente)}</strong><small>Proveedores y servicios</small></div></div>
        <div className="stat-card"><div><span>Facturas fiscales</span><strong>{comprobantesFiscales.length}</strong><small>Con QR AFIP asociado</small></div></div>
      </div>

      <div className="filters-bar">
        <input placeholder="Buscar por proveedor, sociedad, sede, concepto, categoría o comprobante..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="filter-field"><span>Estado</span>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option>Todos</option><option>Pagado</option><option>Pendiente</option>
          </select>
        </label>
        <label className="filter-field"><span>Categoría</span>
          <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
            <option>Todas</option>
            <option>Insumos</option><option>Reactivos</option><option>Servicios</option>
            <option>Sueldos</option><option>Alquileres</option><option>Mantenimiento</option>
          </select>
        </label>
        <label className="filter-field"><span>Sociedad</span>
          <select value={sociedadFiltro} onChange={(e) => setSociedadFiltro(e.target.value)}>
            <option>Todas</option>
            {sociedades.map((sociedad) => <option key={sociedad} value={sociedad}>{sociedad}</option>)}
          </select>
        </label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button className="secondary-button" onClick={() => aplicarFiltroRapido("hoy")}>Hoy</button>
        <button className="secondary-button" onClick={() => aplicarFiltroRapido("mes")}>Este mes</button>
        <button className="secondary-button" onClick={() => aplicarFiltroRapido("pendientes")}>Pendientes</button>
        <button className="secondary-button" onClick={() => aplicarFiltroRapido("limpiar")}>Limpiar</button>
        <button className="secondary-button" onClick={exportarExcel} disabled={loading}><FileSpreadsheet size={15} /> Excel</button>
        <button className="primary-button" onClick={exportarPDF} disabled={loading}><FileText size={15} /> PDF</button>
      </div>

      <div className="panel">
        <h3>Resumen por categoría</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr><th>Categoría</th><th>Total</th><th>Pagado</th><th>Pendiente</th><th>Cantidad</th></tr>
            </thead>
            <tbody>
              {resumenPorCategoria.map((item) => (
                <tr key={item.categoria}>
                  <td><strong>{item.categoria}</strong></td>
                  <td>{formatMoney(item.total)}</td>
                  <td>{formatMoney(item.pagado)}</td>
                  <td>{formatMoney(item.pendiente)}</td>
                  <td>{item.cantidad}</td>
                </tr>
              ))}
              {!loading && resumenPorCategoria.length === 0 && (
                <tr><td colSpan="5">No hay categorías para los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h3>Detalle de egresos</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Proveedor</th><th>Sociedad</th><th>Sede</th>
                <th>Concepto</th><th>Categoría</th><th>Importe</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="9">Cargando egresos...</td></tr>}
              {!loading && egresosFiltrados.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(getFechaReal(item))}</td>
                  <td>{item.proveedor}</td>
                  <td>{item.sociedad}</td>
                  <td>{item.sede}</td>
                  <td>{item.concepto}</td>
                  <td>{item.categoria}</td>
                  <td><strong>{formatMoney(item.importe)}</strong></td>
                  <td><span className={`status-badge ${item.estado.toLowerCase()}`}>{item.estado}</span></td>
                  <td>
                    <div className="table-actions">
                      {item.datosFiscales?.qrUrl && (
                        <button title="Ver comprobante en AFIP" onClick={() => verAfip(item.datosFiscales.qrUrl)}>
                          <ExternalLink size={16} />
                        </button>
                      )}
                      {item.estado === "Pendiente" && (
                        <button title="Marcar como pagado" onClick={() => marcarPagado(item.id)}>
                          <CheckCircle size={16} />
                        </button>
                      )}
                      <button title="Eliminar egreso" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && egresosFiltrados.length === 0 && (
                <tr><td colSpan="9">No se encontraron egresos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "nuevo" && (
        <Modal title="Nuevo egreso" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>Fecha <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></label>
            <label>Proveedor <input required value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></label>
            <label>Sociedad <input required value={form.sociedad} onChange={(e) => setForm({ ...form, sociedad: e.target.value })} /></label>
            <label>Sede
              <select value={form.sedeId} onChange={(e) => setForm({ ...form, sedeId: e.target.value })} required>
                {sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}
              </select>
            </label>
            <label>Categoría
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Importe <input type="number" step="0.01" min="0" required value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} /></label>
            <label>Estado
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                <option>Pendiente</option><option>Pagado</option>
              </select>
            </label>
            <label className="full">Concepto <input required value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando..." : "Guardar egreso"}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "revisarFactura" && egresoPendiente && (
        <Modal title="Revisar factura importada" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={confirmarEgresoImportado}>
            <div className="full">
              <p style={{ margin: 0, opacity: 0.75 }}>El sistema leyó los datos fiscales del QR. Completá manualmente el proveedor, sociedad, categoría y concepto real antes de guardar el egreso.</p>
            </div>
            <label>Fecha <input type="date" required value={egresoPendiente.fecha} onChange={(e) => setEgresoPendiente({ ...egresoPendiente, fecha: e.target.value })} /></label>
            <label>Comprobante <input value={egresoPendiente.comprobante} disabled /></label>
            <label>Proveedor / CUIT <input required value={egresoPendiente.proveedor} onChange={(e) => setEgresoPendiente({ ...egresoPendiente, proveedor: e.target.value })} /></label>
            <label>Sociedad <input required placeholder="Ej: Central Salud S.A." value={egresoPendiente.sociedad} onChange={(e) => setEgresoPendiente({ ...egresoPendiente, sociedad: e.target.value })} /></label>
            <label>Sede
              <select value={egresoPendiente.sedeId} onChange={(e) => setEgresoPendiente({ ...egresoPendiente, sedeId: e.target.value })} required>
                {sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}
              </select>
            </label>
            <label>Categoría
              <select value={egresoPendiente.categoria} onChange={(e) => setEgresoPendiente({ ...egresoPendiente, categoria: e.target.value })}>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Importe <input type="number" step="0.01" min="0" required value={egresoPendiente.importe} onChange={(e) => setEgresoPendiente({ ...egresoPendiente, importe: e.target.value })} /></label>
            <label>Estado
              <select value={egresoPendiente.estado} onChange={(e) => setEgresoPendiente({ ...egresoPendiente, estado: e.target.value })}>
                <option>Pendiente</option><option>Pagado</option>
              </select>
            </label>
            <label className="full">Concepto real del egreso
              <input required placeholder="Ej: Reactivos de laboratorio, mantenimiento de equipos..." value={egresoPendiente.concepto} onChange={(e) => setEgresoPendiente({ ...egresoPendiente, concepto: e.target.value })} />
            </label>
            <div className="full detail-grid">
              <div><span>Archivo</span><strong>{egresoPendiente.archivo}</strong></div>
              <div><span>CAE / CAEA</span><strong>{egresoPendiente.datosFiscales.codAut || "-"}</strong></div>
              <div><span>Moneda</span><strong>{egresoPendiente.datosFiscales.moneda || "-"}</strong></div>
              <div><span>Cotización</span><strong>{egresoPendiente.datosFiscales.ctz || "-"}</strong></div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando..." : "Confirmar y guardar"}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}