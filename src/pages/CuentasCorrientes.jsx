// src/pages/CuentasCorrientes.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Eye,
  CheckCircle,
  AlertTriangle,
  Download,
  FileText,
} from "lucide-react";
import Modal from "../components/Modal";

import logo from "../assets/logo-cedim.png";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { getSedes } from "../services/sedeService";
import {
  createCuentaCorriente,
  deleteCuentaCorriente,
  getCuentasCorrientes,
  marcarCuentaAplicada,
} from "../services/cuentaCorrienteService";
import { getDbSedeId } from "../utils/sedeUtils";

const COMPROBANTES_DEUDA = [
  "Factura",
  "Factura A",
  "Factura B",
  "Factura C",
  "Nota de Débito",
];

const OPCIONES_COMPROBANTE = [
  "Factura A",
  "Factura B",
  "Factura C",
  "Recibo",
  "Nota de Crédito",
  "Nota de Débito",
];

const emptyForm = {
  fecha: new Date().toISOString().split("T")[0],
  entidad: "",
  tipoEntidad: "Obra social",
  sedeId: "",
  comprobante: "Factura A",
  numero: "",
  concepto: "",
  importe: "",
  vencimiento: "",
  estado: "Pendiente",
};

const formatMoney = (value) =>
  `$ ${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (isoString) => {
  if (!isoString) return "-";
  const [year, month, day] = isoString.split("-");
  if (!year || !month || !day) return isoString;
  return `${day}/${month}/${year}`;
};

const toDate = (isoString) => {
  if (!isoString) return null;
  return new Date(`${isoString}T00:00:00`);
};

const safeFileName = (text) =>
  String(text || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_");

const getImpactoContable = (tipoEntidad, comprobante, importe) => {
  const esProveedor = tipoEntidad === "Proveedor";
  const esSumaDeuda = COMPROBANTES_DEUDA.includes(comprobante);

  let debe = 0;
  let haber = 0;

  if (esProveedor) {
    if (esSumaDeuda) haber = Number(importe || 0);
    else debe = Number(importe || 0);
  } else {
    if (esSumaDeuda) debe = Number(importe || 0);
    else haber = Number(importe || 0);
  }

  return { debe, haber };
};

const calcularSaldoMovimiento = (mov) => {
  const { debe, haber } = getImpactoContable(
    mov.tipoEntidad,
    mov.comprobante,
    mov.importe
  );

  const impactoSaldo =
    mov.tipoEntidad === "Proveedor" ? haber - debe : debe - haber;

  return { debe, haber, impactoSaldo };
};

const getDiasVencidos = (vencimiento) => {
  if (!vencimiento) return 0;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fechaVence = toDate(vencimiento);
  if (!fechaVence || fechaVence >= hoy) return 0;

  return Math.floor((hoy - fechaVence) / (1000 * 60 * 60 * 24));
};

const getRangoAging = (dias) => {
  if (dias <= 0) return "No vencido";
  if (dias <= 30) return "0 a 30 días";
  if (dias <= 60) return "31 a 60 días";
  if (dias <= 90) return "61 a 90 días";
  return "Más de 90 días";
};

const getNivelRiesgo = (deudaVencida, cuentasACobrar) => {
  if (deudaVencida <= 0) {
    return { label: "Bajo", color: "#10b981", detail: "Sin deuda vencida relevante" };
  }

  const ratio = cuentasACobrar > 0 ? deudaVencida / cuentasACobrar : 1;

  if (ratio >= 0.35) {
    return { label: "Alto", color: "#ef4444", detail: "Requiere seguimiento inmediato" };
  }

  if (ratio >= 0.15) {
    return { label: "Medio", color: "#f59e0b", detail: "Conviene revisar cobranzas" };
  }

  return { label: "Bajo", color: "#10b981", detail: "Situación controlada" };
};

export default function CuentasCorrientes({ selectedSede, sedeId, dbSedeId }) {
  const [movimientos, setMovimientos] = useState([]);
  const [sedes, setSedes] = useState([]);

  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [modal, setModal] = useState(null);
  const [selectedMayor, setSelectedMayor] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const selectedSedeName = selectedSede?.nombre || "Todas las sedes";
  const idSedeActiva = dbSedeId ?? getDbSedeId(sedeId);
  const sedeBloqueada = Boolean(idSedeActiva);

  async function loadData(currentSedeId = sedeId) {
    setLoading(true);

    try {
      const idParaFiltro = getDbSedeId(currentSedeId);

      const [movimientosData, sedesData] = await Promise.all([
        getCuentasCorrientes(idParaFiltro),
        getSedes(),
      ]);

      setMovimientos(movimientosData || []);
      setSedes(sedesData || []);

      setForm((prev) => ({
        ...prev,
        sedeId: prev.sedeId || idParaFiltro || sedesData?.[0]?.id || "",
      }));
    } catch (error) {
      console.error("Error cargando cuentas corrientes:", error);
      alert("No se pudieron cargar las cuentas corrientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => loadData(idSedeActiva));
  }, [idSedeActiva]);

  const movimientosPorSede = movimientos;

  function openNuevoComprobante() {
    setForm({
      ...emptyForm,
      sedeId: idSedeActiva || sedes[0]?.id || "",
    });
    setModal("nuevo");
  }

  const entidadesUnicas = useMemo(() => {
    return [...new Set(movimientosPorSede.map((m) => m.entidad))].sort();
  }, [movimientosPorSede]);

  const movimientosFiltrados = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    const fechaDesde = toDate(desde);
    const fechaHasta = toDate(hasta);

    return movimientosPorSede.filter((item) => {
      const fechaItem = toDate(item.fecha);

      const matchSearch =
        !searchLower ||
        item.entidad?.toLowerCase().includes(searchLower) ||
        item.concepto?.toLowerCase().includes(searchLower) ||
        item.sede?.toLowerCase().includes(searchLower) ||
        item.numero?.toLowerCase().includes(searchLower) ||
        item.comprobante?.toLowerCase().includes(searchLower);

      const matchTipo = tipoFiltro === "Todos" || item.tipoEntidad === tipoFiltro;
      const matchEstado = estadoFiltro === "Todos" || item.estado === estadoFiltro;

      const matchDesde = !fechaDesde || (fechaItem && fechaItem >= fechaDesde);
      const matchHasta = !fechaHasta || (fechaItem && fechaItem <= fechaHasta);

      return matchSearch && matchTipo && matchEstado && matchDesde && matchHasta;
    });
  }, [movimientosPorSede, search, tipoFiltro, estadoFiltro, desde, hasta]);

  const resumenPorEntidad = useMemo(() => {
    const resumen = {};
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    movimientosFiltrados.forEach((mov) => {
      const key = `${mov.entidad}-${mov.tipoEntidad}-${mov.sede}`;

      if (!resumen[key]) {
        resumen[key] = {
          entidad: mov.entidad,
          tipoEntidad: mov.tipoEntidad,
          sede: mov.sede,
          saldoTotal: 0,
          deudaVencida: 0,
          cantidadMovimientos: 0,
        };
      }

      const { impactoSaldo } = calcularSaldoMovimiento(mov);

      resumen[key].saldoTotal += impactoSaldo;
      resumen[key].cantidadMovimientos += 1;

      if (mov.estado === "Pendiente" && mov.vencimiento) {
        const fechaVence = toDate(mov.vencimiento);

        if (fechaVence && fechaVence < hoy && impactoSaldo > 0) {
          resumen[key].deudaVencida += impactoSaldo;
        }
      }
    });

    return Object.values(resumen).sort((a, b) =>
      a.entidad.localeCompare(b.entidad)
    );
  }, [movimientosFiltrados]);

  const totalCuentasACobrar = resumenPorEntidad
    .filter((i) => i.tipoEntidad !== "Proveedor")
    .reduce((acc, item) => acc + Math.max(0, item.saldoTotal), 0);

  const totalCuentasAPagar = resumenPorEntidad
    .filter((i) => i.tipoEntidad === "Proveedor")
    .reduce((acc, item) => acc + Math.max(0, item.saldoTotal), 0);

  const deudaTotalVencida = resumenPorEntidad.reduce(
    (acc, item) => acc + item.deudaVencida,
    0
  );

  const agingResumen = useMemo(() => {
    const resumen = {
      "No vencido": { rango: "No vencido", cantidad: 0, total: 0 },
      "0 a 30 días": { rango: "0 a 30 días", cantidad: 0, total: 0 },
      "31 a 60 días": { rango: "31 a 60 días", cantidad: 0, total: 0 },
      "61 a 90 días": { rango: "61 a 90 días", cantidad: 0, total: 0 },
      "Más de 90 días": { rango: "Más de 90 días", cantidad: 0, total: 0 },
    };

    movimientosFiltrados.forEach((mov) => {
      if (mov.estado !== "Pendiente") return;

      const { impactoSaldo } = calcularSaldoMovimiento(mov);
      if (impactoSaldo <= 0) return;

      const dias = getDiasVencidos(mov.vencimiento);
      const rango = getRangoAging(dias);

      resumen[rango].cantidad += 1;
      resumen[rango].total += impactoSaldo;
    });

    return Object.values(resumen);
  }, [movimientosFiltrados]);

  const riesgoFinanciero = useMemo(
    () => getNivelRiesgo(deudaTotalVencida, totalCuentasACobrar),
    [deudaTotalVencida, totalCuentasACobrar]
  );

  const aplicarPeriodoRapido = (tipo) => {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");

    if (tipo === "hoy") {
      const fecha = `${yyyy}-${mm}-${dd}`;
      setDesde(fecha);
      setHasta(fecha);
      return;
    }

    if (tipo === "mes") {
      setDesde(`${yyyy}-${mm}-01`);
      setHasta(`${yyyy}-${mm}-${dd}`);
      return;
    }

    if (tipo === "vencidos") {
      setEstadoFiltro("Pendiente");
      setDesde("");
      setHasta(`${yyyy}-${mm}-${dd}`);
      return;
    }

    setDesde("");
    setHasta("");
  };

  const detalleLibroMayor = useMemo(() => {
    if (!selectedMayor) return [];

    const entidadMovs = movimientosPorSede
      .filter(
        (m) =>
          m.entidad === selectedMayor.entidad &&
          m.tipoEntidad === selectedMayor.tipoEntidad &&
          m.sede === selectedMayor.sede
      )
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    let saldoAcc = 0;

    return entidadMovs.map((mov) => {
      const { debe, haber, impactoSaldo } = calcularSaldoMovimiento(mov);
      saldoAcc += impactoSaldo;

      return {
        ...mov,
        debe,
        haber,
        saldoAcumulado: saldoAcc,
      };
    });
  }, [movimientosPorSede, selectedMayor]);

  const reporteNombre = useMemo(() => {

    const sede = selectedSedeName;


    const periodo =
      desde || hasta
        ? `${desde || "inicio"}_${hasta || "actual"}`
        : "todos_los_periodos";

    return `Cuentas_Corrientes_${safeFileName(sede)}_${safeFileName(periodo)}`;
  }, [selectedSede, desde, hasta]);

  const exportarReporteExcel = async () => {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = "CEDIM";
    workbook.created = new Date();

    const resumenSheet = workbook.addWorksheet("Resumen");
    resumenSheet.columns = [
      { header: "Entidad", key: "entidad", width: 32 },
      { header: "Tipo", key: "tipoEntidad", width: 18 },
      { header: "Sede", key: "sede", width: 22 },
      { header: "Movimientos", key: "cantidadMovimientos", width: 14 },
      { header: "Saldo total", key: "saldoTotal", width: 18 },
      { header: "Deuda vencida", key: "deudaVencida", width: 18 },
    ];

    resumenSheet.addRows(
      resumenPorEntidad.map((item) => ({
        ...item,
        saldoTotal: item.saldoTotal,
        deudaVencida: item.deudaVencida,
      }))
    );

    resumenSheet.addRow({});
    resumenSheet.addRow({
      entidad: "TOTAL A COBRAR",
      saldoTotal: totalCuentasACobrar,
    });
    resumenSheet.addRow({
      entidad: "TOTAL A PAGAR",
      saldoTotal: totalCuentasAPagar,
    });
    resumenSheet.addRow({
      entidad: "DEUDA VENCIDA",
      saldoTotal: deudaTotalVencida,
    });

    const movimientosSheet = workbook.addWorksheet("Movimientos");
    movimientosSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Entidad", key: "entidad", width: 32 },
      { header: "Tipo entidad", key: "tipoEntidad", width: 18 },
      { header: "Sede", key: "sede", width: 22 },
      { header: "Comprobante", key: "comprobante", width: 18 },
      { header: "Número", key: "numero", width: 20 },
      { header: "Concepto", key: "concepto", width: 38 },
      { header: "Vencimiento", key: "vencimiento", width: 14 },
      { header: "Debe", key: "debe", width: 16 },
      { header: "Haber", key: "haber", width: 16 },
      { header: "Estado", key: "estado", width: 14 },
    ];

    movimientosFiltrados.forEach((mov) => {
      const { debe, haber } = calcularSaldoMovimiento(mov);

      movimientosSheet.addRow({
        fecha: formatDate(mov.fecha),
        entidad: mov.entidad,
        tipoEntidad: mov.tipoEntidad,
        sede: mov.sede,
        comprobante: mov.comprobante,
        numero: mov.numero,
        concepto: mov.concepto,
        vencimiento: formatDate(mov.vencimiento),
        debe: debe || "",
        haber: haber || "",
        estado: mov.estado,
      });
    });

    const agingSheet = workbook.addWorksheet("Aging deuda");
    agingSheet.columns = [
      { header: "Rango", key: "rango", width: 22 },
      { header: "Cantidad", key: "cantidad", width: 14 },
      { header: "Total", key: "total", width: 18 },
    ];
    agingSheet.addRows(agingResumen);

    [resumenSheet, movimientosSheet, agingSheet].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A8A" },
      };
      sheet.getRow(1).alignment = {
        vertical: "middle",
        horizontal: "center",
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

    ["saldoTotal", "deudaVencida"].forEach((key) => {
      resumenSheet.getColumn(key).numFmt = '"$"#,##0.00';
    });

    ["debe", "haber"].forEach((key) => {
      movimientosSheet.getColumn(key).numFmt = '"$"#,##0.00';
    });

    agingSheet.getColumn("total").numFmt = '"$"#,##0.00';

    const buffer = await workbook.xlsx.writeBuffer();
    const data = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(data, `${reporteNombre}.xlsx`);
  };

  const exportarReportePDF = () => {
    const doc = new jsPDF("landscape", "mm", "a4");

    const pageWidth = doc.internal.pageSize.getWidth();

    // ===== HEADER =====
    try {
      doc.addImage(logo, "PNG", 14, 10, 22, 22);
    } catch (e) {
      console.warn("Logo no cargado");
    }

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Reporte de Cuentas Corrientes", 50, 16);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Plataforma de gestión CEDIM", 50, 22);
    doc.text("Laboratorio de analisis clínicos", 50, 27);

    // Línea separadora
    doc.setDrawColor(200);
    doc.line(14, 32, pageWidth - 14, 32);

    // ===== FILTROS =====
    doc.setFontSize(9);
    doc.text(`Sede: ${selectedSedeName}`, 14, 38);
    doc.text(`Tipo: ${tipoFiltro}`, 14, 43);
    doc.text(`Estado: ${estadoFiltro}`, 14, 48);
    doc.text(
      `Periodo: ${desde || "Inicio"} al ${hasta || "Actual"}`,
      14,
      53
    );
    doc.text(
      `Generado: ${new Date().toLocaleString("es-AR")}`,
      14,
      58
    );

    // ===== KPIs =====
    doc.setFont("helvetica", "bold");
    doc.text(`A cobrar: ${formatMoney(totalCuentasACobrar)}`, 200, 38);
    doc.text(`A pagar: ${formatMoney(totalCuentasAPagar)}`, 200, 43);
    doc.text(`Deuda vencida: ${formatMoney(deudaTotalVencida)}`, 200, 48);
    doc.text(`Riesgo financiero: ${riesgoFinanciero.label}`, 200, 53);

    // ===== TABLA RESUMEN =====
    autoTable(doc, {
      startY: 65,
      head: [["Entidad", "Tipo", "Sede", "Mov.", "Saldo", "Vencido"]],
      body: resumenPorEntidad.map((item) => [
        item.entidad,
        item.tipoEntidad,
        item.sede,
        item.cantidadMovimientos,
        formatMoney(item.saldoTotal),
        formatMoney(item.deudaVencida),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
      },
      columnStyles: {
        4: { halign: "right" },
        5: { halign: "right" },
      },
    });

    // ===== AGING DE DEUDA =====
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Aging deuda", "Cantidad", "Total"]],
      body: agingResumen.map((item) => [
        item.rango,
        item.cantidad,
        formatMoney(item.total),
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [127, 29, 29],
        textColor: 255,
      },
      columnStyles: {
        2: { halign: "right" },
      },
    });

    // ===== TABLA DETALLE =====
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [
        [
          "Fecha",
          "Entidad",
          "Tipo",
          "Sede",
          "Comprobante",
          "Concepto",
          "Vto",
          "Importe",
          "Estado",
        ],
      ],
      body: movimientosFiltrados.map((item) => [
        formatDate(item.fecha),
        item.entidad,
        item.tipoEntidad,
        item.sede,
        `${item.comprobante} ${item.numero || ""}`,
        item.concepto,
        formatDate(item.vencimiento),
        formatMoney(item.importe),
        item.estado,
      ]),
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
      },
      columnStyles: {
        7: { halign: "right" },
      },
    });

    // ===== FOOTER =====
    const pageCount = doc.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      doc.setFontSize(8);
      doc.setTextColor(150);

      doc.text(
        "Generado por plataforma de gestión CEDIM",
        14,
        doc.internal.pageSize.getHeight() - 8
      );

      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - 30,
        doc.internal.pageSize.getHeight() - 8
      );
    }

    doc.save(`${reporteNombre}.pdf`);
  };

  const exportarMayorExcel = async () => {
    if (!selectedMayor) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Libro Mayor");

    worksheet.columns = [
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Comprobante", key: "comprobante", width: 25 },
      { header: "Concepto / Detalle", key: "concepto", width: 45 },
      { header: "Vencimiento", key: "vencimiento", width: 15 },
      { header: "Debe", key: "debe", width: 20 },
      { header: "Haber", key: "haber", width: 20 },
      { header: "Saldo acumulado", key: "saldo", width: 20 },
      { header: "Estado", key: "estado", width: 15 },
    ];

    detalleLibroMayor.forEach((m) => {
      worksheet.addRow({
        fecha: formatDate(m.fecha),
        comprobante: `${m.comprobante} ${m.numero || ""}`,
        concepto: m.concepto,
        vencimiento: formatDate(m.vencimiento),
        debe: m.debe > 0 ? m.debe : "",
        haber: m.haber > 0 ? m.haber : "",
        saldo: m.saldoAcumulado,
        estado: m.estado,
      });
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" },
    };

    ["debe", "haber", "saldo"].forEach((key) => {
      worksheet.getColumn(key).numFmt = '"$"#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const data = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(
      data,
      `Libro_Mayor_${safeFileName(selectedMayor.entidad)}_${safeFileName(
        selectedMayor.sede
      )}.xlsx`
    );
  };

  const exportarMayorPDF = () => {
    if (!selectedMayor) return;

    const doc = new jsPDF("landscape", "mm", "a4");

    doc.setFontSize(16);
    doc.text(`Libro Mayor - ${selectedMayor.entidad}`, 14, 15);

    doc.setFontSize(9);
    doc.text(`Tipo: ${selectedMayor.tipoEntidad}`, 14, 22);
    doc.text(`Sede: ${selectedMayor.sede}`, 14, 27);
    doc.text(`Generado: ${new Date().toLocaleDateString("es-AR")}`, 14, 32);

    autoTable(doc, {
      startY: 40,
      head: [
        [
          "Fecha",
          "Comprobante",
          "Concepto",
          "Vencimiento",
          "Debe",
          "Haber",
          "Saldo acum.",
          "Estado",
        ],
      ],
      body: detalleLibroMayor.map((item) => [
        formatDate(item.fecha),
        `${item.comprobante} ${item.numero || ""}`,
        item.concepto,
        formatDate(item.vencimiento),
        item.debe > 0 ? formatMoney(item.debe) : "-",
        item.haber > 0 ? formatMoney(item.haber) : "-",
        formatMoney(item.saldoAcumulado),
        item.estado,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] },
      columnStyles: {
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
      },
    });

    doc.save(
      `Libro_Mayor_${safeFileName(selectedMayor.entidad)}_${safeFileName(
        selectedMayor.sede
      )}.pdf`
    );
  };

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ...form,
        entidad: form.entidad.trim().toUpperCase(),
      };

      await createCuentaCorriente(payload);
      await loadData();

      setForm({
        ...emptyForm,
        sedeId: idSedeActiva || sedes[0]?.id || "",
      });

      setModal(null);
    } catch (err) {
      alert(err.message || "No se pudo registrar el comprobante.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("¿Eliminar comprobante?")) return;

    setDeletingId(id);

    try {
      await deleteCuentaCorriente(id);
      await loadData();
    } catch (err) {
      alert(err.message || "No se pudo eliminar.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAplicar(id) {
    try {
      await marcarCuentaAplicada(id);
      await loadData();
    } catch (error) {
      alert("No se pudo marcar como aplicado.");
    }
  }

  return (
    <section className="page">
      <div className="page-header" data-tour="cuentas-header">
        <div>
          <h2>Cuentas corrientes</h2>
          <p>
            Gestión de saldos, vencimientos, libro mayor y reportes por entidad.
          </p>
        </div>

        <button className="primary-button" onClick={openNuevoComprobante} data-tour="cuentas-nueva">
          <Plus size={16} /> Registrar Comprobante
        </button>
      </div>

      <div className="stats-grid small" data-tour="cuentas-resumen">
        <div className="stat-card" data-tour="cuentas-resumen-total">
          <div>
            <span>A Cobrar</span>
            <strong>{formatMoney(totalCuentasACobrar)}</strong>
            <small>Obras sociales, prepagas y particulares</small>
          </div>
        </div>

        <div className="stat-card" data-tour="cuentas-resumen-pendiente">
          <div>
            <span>A Pagar</span>
            <strong>{formatMoney(totalCuentasAPagar)}</strong>
            <small>Proveedores pendientes</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Deuda vencida</span>
            <strong
              style={{
                color: deudaTotalVencida > 0 ? "#ef4444" : "inherit",
              }}
            >
              {formatMoney(deudaTotalVencida)}
            </strong>
            <small>Comprobantes fuera de término</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Riesgo financiero</span>
            <strong style={{ color: riesgoFinanciero.color }}>
              {riesgoFinanciero.label}
            </strong>
            <small>{riesgoFinanciero.detail}</small>
          </div>
        </div>
      </div>

      <div className="filters-bar" data-tour="cuentas-filtros">
        <input
          placeholder="Buscar por entidad, sede, concepto, comprobante o número..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-tour="cuentas-busqueda"
        />

        <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
          <option>Todos</option>
          <option>Obra social</option>
          <option>Prepaga</option>
          <option>Proveedor</option>
          <option>Particular</option>
        </select>

        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
        >
          <option>Todos</option>
          <option>Pendiente</option>
          <option>Aplicado</option>
        </select>

        <button className="secondary-button" type="button" onClick={() => aplicarPeriodoRapido("hoy")}>
          Hoy
        </button>

        <button className="secondary-button" type="button" onClick={() => aplicarPeriodoRapido("mes")}>
          Este mes
        </button>

        <button className="secondary-button" type="button" onClick={() => aplicarPeriodoRapido("vencidos")}>
          Vencidos
        </button>

        <button className="secondary-button" type="button" onClick={() => aplicarPeriodoRapido("limpiar")}>
          Limpiar
        </button>

        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />

        <button className="secondary-button" onClick={exportarReporteExcel}>
          <Download size={15} /> Excel
        </button>

        <button className="secondary-button" onClick={exportarReportePDF}>
          <FileText size={15} /> PDF
        </button>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3>Aging de deuda pendiente</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Rango</th>
                <th>Cantidad</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {agingResumen.map((item) => (
                <tr key={item.rango}>
                  <td>{item.rango}</td>
                  <td>{item.cantidad}</td>
                  <td>
                    <strong>{formatMoney(item.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Resumen de saldos por entidad</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Entidad</th>
                <th>Tipo</th>
                <th>Sede</th>
                <th>Movimientos</th>
                <th>Saldo total</th>
                <th>Deuda vencida</th>
                <th>Libro mayor</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7">Cargando cuentas corrientes...</td>
                </tr>
              )}

              {!loading &&
                resumenPorEntidad.map((item) => (
                  <tr key={`${item.entidad}-${item.tipoEntidad}-${item.sede}`}>
                    <td>
                      <strong>{item.entidad}</strong>
                    </td>
                    <td>{item.tipoEntidad}</td>
                    <td>{item.sede}</td>
                    <td>{item.cantidadMovimientos}</td>
                    <td>
                      <strong
                        style={{
                          color:
                            item.tipoEntidad === "Proveedor" && item.saldoTotal > 0
                              ? "#ef4444"
                              : "#10b981",
                        }}
                      >
                        {formatMoney(item.saldoTotal)}
                      </strong>
                    </td>
                    <td>
                      {item.deudaVencida > 0 ? (
                        <span
                          style={{
                            color: "#ef4444",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <AlertTriangle size={14} />{" "}
                          {formatMoney(item.deudaVencida)}
                        </span>
                      ) : (
                        <span style={{ color: "#6b7280" }}>Al día</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="secondary-button"
                        style={{ padding: "4px 8px", fontSize: "12px" }}
                        onClick={() => {
                          setSelectedMayor(item);
                          setModal("mayor");
                        }}
                      >
                        <Eye size={14} style={{ marginRight: 4 }} /> Ver Mayor
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && resumenPorEntidad.length === 0 && (
                <tr>
                  <td colSpan="7">No se encontraron entidades.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }} data-tour="cuentas-tabla">
        <h3>Historial de movimientos</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Entidad</th>
                <th>Tipo entidad</th>
                <th>Sede</th>
                <th>Comprobante</th>
                <th>Concepto</th>
                <th>Importe</th>
                <th>Vencimiento</th>
                <th>Estado</th>
                <th data-tour="cuentas-acciones">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {movimientosFiltrados.map((item, index) => (
                <tr key={item.id}>
                  <td>{formatDate(item.fecha)}</td>
                  <td>{item.entidad}</td>
                  <td>{item.tipoEntidad}</td>
                  <td>{item.sede}</td>
                  <td>
                    <strong>{item.comprobante}</strong>
                    <br />
                    <small>{item.numero || "-"}</small>
                  </td>
                  <td>{item.concepto}</td>
                  <td>{formatMoney(item.importe)}</td>
                  <td>{formatDate(item.vencimiento)}</td>
                  <td>
                    <span className={`status-badge ${item.estado.toLowerCase()}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions" data-tour={index === 0 ? "cuentas-acciones" : undefined}>
                      {item.estado === "Pendiente" && (
                        <button onClick={() => handleAplicar(item.id)}>
                          <CheckCircle size={16} />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {movimientosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="10">No se encontraron movimientos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "nuevo" && (
        <Modal title="Registrar nuevo comprobante" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              Fecha de emisión
              <input
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </label>

            <label>
              Entidad
              <input
                required
                list="lista-entidades"
                placeholder="Ej: OSDE..."
                value={form.entidad}
                onChange={(e) => setForm({ ...form, entidad: e.target.value })}
              />
              <datalist id="lista-entidades">
                {entidadesUnicas.map((nombre) => (
                  <option key={nombre} value={nombre} />
                ))}
              </datalist>
            </label>

            <label>
              Clasificación
              <select
                value={form.tipoEntidad}
                onChange={(e) =>
                  setForm({ ...form, tipoEntidad: e.target.value })
                }
              >
                <option>Obra social</option>
                <option>Prepaga</option>
                <option>Proveedor</option>
                <option>Particular</option>
              </select>
            </label>

            <label>
              Sede
              <select
                value={form.sedeId}
                onChange={(e) => setForm({ ...form, sedeId: e.target.value })}
                disabled={sedeBloqueada}
                required
              >
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tipo de comprobante
              <select
                value={form.comprobante}
                onChange={(e) =>
                  setForm({ ...form, comprobante: e.target.value })
                }
              >
                {OPCIONES_COMPROBANTE.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {opcion}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Número de comprobante
              <input
                placeholder="Ej: 0001-00004562"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
            </label>

            <label>
              Importe total
              <input
                type="number"
                step="0.01"
                required
                value={form.importe}
                onChange={(e) => setForm({ ...form, importe: e.target.value })}
              />
            </label>

            <label>
              Fecha de vencimiento
              <input
                type="date"
                value={form.vencimiento}
                onChange={(e) =>
                  setForm({ ...form, vencimiento: e.target.value })
                }
              />
            </label>

            <label className="full">
              Concepto / Detalle
              <input
                required
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value })}
              />
            </label>

            <div className="modal-actions" style={{ gridColumn: "1 / -1" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Registrando..." : "Registrar en cuenta"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "mayor" && selectedMayor && (
        <Modal
          title={`Libro Mayor: ${selectedMayor.entidad}`}
          onClose={() => setModal(null)}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <strong>{selectedMayor.tipoEntidad}</strong>
              <br />
              <small>{selectedMayor.sede}</small>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary-button" onClick={exportarMayorExcel}>
                <Download size={14} /> Excel
              </button>

              <button className="secondary-button" onClick={exportarMayorPDF}>
                <FileText size={14} /> PDF
              </button>
            </div>
          </div>

          <div
            className="table-card"
            style={{
              overflowX: "auto",
              margin: "0 -10px",
              padding: "0 10px",
            }}
          >
            <table style={{ minWidth: "900px", width: "100%" }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Concepto</th>
                  <th>Vencimiento</th>
                  <th style={{ textAlign: "right" }}>Debe</th>
                  <th style={{ textAlign: "right" }}>Haber</th>
                  <th
                    style={{
                      textAlign: "right",
                      borderLeft: "2px solid #e5e7eb",
                    }}
                  >
                    Saldo acum.
                  </th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {detalleLibroMayor.map((item) => {
                  const vencido =
                    item.estado === "Pendiente" &&
                    item.vencimiento &&
                    toDate(item.vencimiento) < toDate(new Date().toISOString().split("T")[0]);

                  return (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatDate(item.fecha)}
                      </td>

                      <td style={{ whiteSpace: "nowrap" }}>
                        <strong>{item.comprobante}</strong>
                        <br />
                        <small style={{ color: "#6b7280" }}>
                          {item.numero || "-"}
                        </small>
                      </td>

                      <td>{item.concepto}</td>

                      <td style={{ whiteSpace: "nowrap" }}>
                        {vencido ? (
                          <span style={{ color: "#ef4444", fontWeight: "bold" }}>
                            {formatDate(item.vencimiento)} (Vencido)
                          </span>
                        ) : (
                          formatDate(item.vencimiento)
                        )}
                      </td>

                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {item.debe > 0 ? formatMoney(item.debe) : "-"}
                      </td>

                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {item.haber > 0 ? formatMoney(item.haber) : "-"}
                      </td>

                      <td
                        style={{
                          textAlign: "right",
                          borderLeft: "2px solid #e5e7eb",
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatMoney(item.saldoAcumulado)}
                      </td>

                      <td>
                        <span
                          className={`status-badge ${item.estado.toLowerCase()}`}
                        >
                          {item.estado}
                        </span>
                      </td>

                      <td>
                        <div className="table-actions">
                          {item.estado === "Pendiente" && (
                            <button onClick={() => handleAplicar(item.id)}>
                              <CheckCircle size={16} />
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {detalleLibroMayor.length === 0 && (
                  <tr>
                    <td colSpan="9">No hay movimientos.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </section>
  );
}
