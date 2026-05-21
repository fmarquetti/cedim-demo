import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export { ExcelJS, jsPDF, autoTable };

export const formatMoney = (value = 0) =>
  `$ ${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const formatDate = (value) => {
  if (!value) return "-";
  const clean = String(value).includes("T") ? String(value).split("T")[0] : String(value);
  if (clean.includes("/")) return clean;
  const [year, month, day] = clean.split("-");
  if (!year || !month || !day) return clean;
  return `${day}/${month}/${year}`;
};

export const safeFileName = (text) =>
  String(text || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

export function addPdfHeader(doc, { title, subtitle, generatedBy = "TECNEW" } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setTextColor(25, 36, 51);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("CEDIM", 14, 15);

  doc.setFontSize(12);
  doc.text(title || "Reporte", 14, 23);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (subtitle) doc.text(subtitle, 14, 30);
  doc.text(`Generado: ${formatDate(new Date().toISOString())}`, pageWidth - 14, 15, { align: "right" });
  if (generatedBy) doc.text(`Generado por ${generatedBy}`, pageWidth - 14, 22, { align: "right" });

  doc.setDrawColor(210, 216, 226);
  doc.line(14, 35, pageWidth - 14, 35);
}

export function addPdfFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Documento generado por sistema CEDIM", 14, pageHeight - 10);
    doc.text(`Pagina ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: "right" });
  }
}

export async function exportWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

export function styleWorkbook(workbook) {
  workbook.worksheets.forEach((sheet) => {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  });
}
