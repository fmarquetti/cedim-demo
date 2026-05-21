import { addPdfFooter, addPdfHeader, autoTable, formatDate, formatMoney, jsPDF, safeFileName } from "./reportUtils";

const empty = (value) => value || "-";

export function generarOrdenPagoPdf(orden) {
  if (!orden) return;

  const doc = new jsPDF("portrait", "mm", "a4");
  const numero = orden.numeroFormateado || `OP-${String(orden.numero || 0).padStart(8, "0")}`;

  addPdfHeader(doc, {
    title: "Orden de Pago",
    subtitle: `${numero} | Fecha ${formatDate(orden.fecha)} | Estado ${empty(orden.estado)}`,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Datos del proveedor", 14, 45);

  autoTable(doc, {
    startY: 50,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [71, 85, 105], cellWidth: 32 },
      2: { fontStyle: "bold", textColor: [71, 85, 105], cellWidth: 32 },
    },
    body: [
      ["Proveedor", empty(orden.proveedor), "CUIT", empty(orden.proveedorCuit)],
      ["Sociedad", empty(orden.sociedad), "Sede", empty(orden.sede || orden.sedeNombre)],
      ["Medio de pago", empty(orden.medioPago), "Cuenta pago", empty(orden.cuentaPago)],
    ],
  });

  const items = orden.items || [];
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [["Fecha egreso", "Comprobante", "Concepto", "Categoria", "Importe"]],
    body: items.map((item) => {
      const egreso = item.egreso || {};
      return [
        formatDate(egreso.fechaDb || egreso.fecha),
        empty(egreso.comprobante),
        empty(item.descripcion || egreso.concepto),
        empty(egreso.categoria),
        formatMoney(item.importe || egreso.importe),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255] },
    columnStyles: { 4: { halign: "right" } },
    didDrawPage: () => {
      if (doc.internal.getCurrentPageInfo().pageNumber > 1) {
        addPdfHeader(doc, { title: "Orden de Pago", subtitle: numero });
      }
    },
  });

  let y = doc.lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Total de la orden: ${formatMoney(orden.importeTotal)}`, 196, y, { align: "right" });

  if (orden.observaciones) {
    y += 10;
    doc.text("Observaciones", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(orden.observaciones, 182);
    doc.text(lines, 14, y + 6);
    y += 8 + lines.length * 4;
  }

  y = Math.max(y + 10, 235);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Aprobada en: ${orden.approvedAt ? formatDate(orden.approvedAt) : "-"}`, 14, y);
  doc.text(`Pagada en: ${orden.paidAt ? formatDate(orden.paidAt) : "-"}`, 110, y);

  y += 24;
  [["Preparo", 14], ["Autorizo", 78], ["Recibio", 142]].forEach(([label, x]) => {
    doc.line(x, y, x + 46, y);
    doc.text(label, x + 23, y + 6, { align: "center" });
  });

  addPdfFooter(doc);
  doc.save(`OrdenPago_${safeFileName(numero)}_${safeFileName(orden.proveedor)}.pdf`);
}
