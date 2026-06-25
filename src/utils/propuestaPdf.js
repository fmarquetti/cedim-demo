import { jsPDF } from "./reportUtils";
import { getModulesByGroup } from "../data/systemModulesCatalog";

const BRAND = "Marquetti & Asociados";
const primary = [2, 139, 175];
const secondary = [58, 115, 185];
const text = [19, 34, 56];
const muted = [100, 116, 139];
const border = [222, 229, 239];
const surface = [248, 251, 253];

const value = (input, fallback = "-") => String(input || fallback);
const splitLines = (input) => String(input || "").split("\n").map((line) => line.trim()).filter(Boolean);

function resolvePublicPath(assetPath) {
  if (!assetPath || assetPath === "missing") return assetPath;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${String(assetPath).replace(/^\//, "")}`;
}

export async function loadImageAsDataUrl(path) {
  try {
    if (!path || path === "missing") return null;
    const response = await fetch(resolvePublicPath(path));
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function header(doc, section) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...primary);
  doc.roundedRect(12, 10, width - 24, 17, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(BRAND, 18, 21);
  doc.setFont("helvetica", "normal");
  doc.text(section, width - 18, 21, { align: "right" });
}

function footer(doc, data) {
  const pages = doc.internal.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...border);
    doc.line(14, height - 16, width - 14, height - 16);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${BRAND} - ${value(data.fecha)}`, 14, height - 9);
    doc.text(`Pagina ${page} de ${pages}`, width - 14, height - 9, { align: "right" });
  }
}

function addPage(doc, section) {
  if (doc.internal.getNumberOfPages() > 0) doc.addPage();
  header(doc, section);
}

function title(doc, textValue, y = 43) {
  doc.setTextColor(...text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(textValue, 18, y);
}

function card(doc, x, y, w, h, heading, body, options = {}) {
  doc.setFillColor(...(options.fill || [255, 255, 255]));
  doc.setDrawColor(...border);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");
  doc.setTextColor(...(options.headingColor || primary));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.headingSize || 10);
  doc.text(heading, x + 5, y + 9);
  doc.setTextColor(...text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(options.bodySize || 8.5);
  doc.text(doc.splitTextToSize(value(body), w - 10), x + 5, y + 17, { lineHeightFactor: 1.25 });
}

function bullets(doc, items, x, y, maxWidth, maxItems = 8) {
  let cursor = y;
  items.slice(0, maxItems).forEach((item) => {
    const wrapped = doc.splitTextToSize(String(item), maxWidth - 6);
    doc.setTextColor(...primary);
    doc.text("-", x, cursor);
    doc.setTextColor(...text);
    doc.text(wrapped, x + 5, cursor);
    cursor += Math.max(5, wrapped.length * 4.1 + 1);
  });
  return cursor;
}

function addImageCard(doc, dataUrl, x, y, w, h) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...border);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");
  if (!dataUrl) {
    doc.setTextColor(...muted);
    doc.setFontSize(9);
    doc.text("Captura no disponible.", x + 8, y + h / 2);
    return;
  }
  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = props.width / props.height;
    let imageW = w - 8;
    let imageH = imageW / ratio;
    if (imageH > h - 8) {
      imageH = h - 8;
      imageW = imageH * ratio;
    }
    doc.addImage(dataUrl, "PNG", x + (w - imageW) / 2, y + (h - imageH) / 2, imageW, imageH);
  } catch {
    doc.setTextColor(...muted);
    doc.setFontSize(9);
    doc.text("Captura no disponible.", x + 8, y + h / 2);
  }
}

function filenameFor(data) {
  const client = value(data.cliente, "Cliente").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `Propuesta_${client || "CEDIM"}_Marquetti_Asociados.pdf`;
}

export async function generarPropuestaPdf(data, modules = [], screenshotsManifest = {}) {
  const doc = new jsPDF("portrait", "mm", "a4");
  const width = doc.internal.pageSize.getWidth();

  header(doc, "Propuesta comercial");
  doc.setTextColor(...primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(value(data.cliente, "Cliente"), 18, 50);
  doc.setTextColor(...text);
  doc.setFontSize(23);
  doc.text(doc.splitTextToSize(value(data.titulo, "Propuesta Comercial"), 174), 18, 66);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(doc.splitTextToSize(value(data.subtitulo, ""), 166), 18, 90);
  card(doc, 18, 114, 80, 34, "Preparado por", value(data.preparadoPor, BRAND));
  card(doc, 110, 114, 82, 34, "Fecha e inicio", `${value(data.fecha)}\nInicio sugerido: ${value(data.inicioSugerido, "A coordinar")}`);
  doc.setFillColor(...secondary);
  doc.roundedRect(18, 162, 174, 12, 5, 5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Demo disponible", 26, 170);
  card(doc, 18, 186, 174, 54, "Resumen ejecutivo", value(data.contexto));

  addPage(doc, "Contexto e implementacion");
  title(doc, "Contexto e implementacion sugerida");
  card(doc, 18, 54, 174, 70, "Cierre balance 30/06 e inicio 01/07", value(data.contexto));
  card(doc, 18, 136, 54, 42, "Revision demo", "Recorrer la demo funcional con los usuarios internos y validar el alcance operativo.");
  card(doc, 78, 136, 54, 42, "Validacion contador", "Revisar circuitos contables, IVA, asientos automaticos y criterios de cierre.");
  card(doc, 138, 136, 54, 42, "Transicion", "Configurar datos, saldos iniciales y comenzar desde el periodo sugerido.");

  addPage(doc, "Funcionamiento general");
  title(doc, "Funcionamiento general");
  card(doc, 18, 54, 174, 56, "Sistema administrativo-contable integrado", value(data.funcionamientoGeneral));
  card(doc, 18, 122, 174, 54, "Circuitos automaticos", "Factura -> IVA -> CC cliente -> asiento\nEgreso -> IVA Compras -> proveedor -> asiento\nOrden de pago -> pago -> asiento -> auditoria\nBanco -> conciliacion -> asiento");

  addPage(doc, "Acceso demo");
  title(doc, "Acceso demo");
  card(doc, 18, 56, 82, 44, "Datos de acceso", `URL: ${value(data.urlDemo)}\nUsuario: ${value(data.usuarioDemo)}\nContrasena: ${value(data.passwordDemo)}`);
  card(doc, 110, 56, 82, 44, "Que revisar", "Dashboard, ingresos, egresos, bancos, ordenes de pago, IVA, contabilidad, cuentas corrientes, auditoria y reportes.");
  card(doc, 18, 116, 174, 44, "Uso de la demo", "La demo debe utilizarse con datos ficticios o sanitizados. No se deben cargar datos sensibles reales en el entorno de prueba.");

  const imageCache = {};
  const modulesByGroup = getModulesByGroup(modules);
  for (const [group, groupModules] of Object.entries(modulesByGroup)) {
    for (const module of groupModules) {
      addPage(doc, group);
      title(doc, module.title);
      doc.setTextColor(...muted);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(group, 18, 51);
      card(doc, 18, 58, 82, 44, "Descripcion", module.shortDescription);
      card(doc, 110, 58, 82, 44, "Valor para el negocio", module.businessValue);
      doc.setTextColor(...primary);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Funcionalidades principales", 18, 116);
      bullets(doc, module.features, 20, 126, 76, 7);
      doc.text("Flujo e integraciones", 110, 116);
      bullets(doc, [...module.workflow, ...module.integrations], 112, 126, 76, 8);
      const screenshotPath = screenshotsManifest?.screenshots?.[module.screenshotKey];
      if (!imageCache[module.screenshotKey]) imageCache[module.screenshotKey] = await loadImageAsDataUrl(screenshotPath);
      addImageCard(doc, imageCache[module.screenshotKey], 18, 178, 174, 70);
    }
  }

  addPage(doc, "Integraciones");
  title(doc, "Integraciones entre modulos");
  const rows = [
    ["Factura", "IVA Ventas, CC cliente y asiento", "IVA, libro diario, balance"],
    ["Egreso", "IVA Compras, proveedor y asiento", "IVA, ordenes de pago, balance"],
    ["Orden de pago", "Pago, cuenta corriente y auditoria", "Proveedores, bancos, reportes"],
    ["Banco", "Conciliacion y asiento", "Panel contador, contabilidad"],
  ];
  let y = 62;
  rows.forEach((row) => {
    card(doc, 18, y, 174, 24, row[0], `Impacto automatico: ${row[1]}\nReportes afectados: ${row[2]}`, { bodySize: 8 });
    y += 31;
  });

  addPage(doc, "Metodologia");
  title(doc, "Metodologia de trabajo");
  bullets(doc, ["Revision demo.", "Validacion contador.", "Configuracion inicial.", "Carga de saldos iniciales.", "Inicio operativo 01/07.", "Acompanamiento inicial."], 22, 64, 160, 10);

  addPage(doc, "Alcance no incluido");
  title(doc, "Opcionales / integraciones futuras");
  bullets(doc, splitLines(data.opcionalesNoIncluido), 22, 64, 160, 12);

  addPage(doc, "Costo");
  title(doc, "Costo comercial");
  doc.setFillColor(...secondary);
  doc.roundedRect(18, 58, width - 36, 44, 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(value(data.valorMensual, "A definir"), 28, 78);
  doc.setFontSize(10);
  doc.text(value(data.revision, "Revision a definir"), 28, 92);
  card(doc, 18, 118, 174, 58, "Incluye", value(data.incluyeMantenimiento));

  addPage(doc, "Cierre");
  title(doc, "Proximo paso");
  card(doc, 18, 58, 174, 54, "Reunion demo", "Coordinar una reunion para recorrer la demo, validar el circuito junto con el contador y confirmar ajustes previos al inicio operativo.");
  card(doc, 18, 126, 82, 42, "Validacion", "Definir modulos incluidos, datos iniciales, criterios contables y fecha de salida.");
  card(doc, 110, 126, 82, 42, "Contacto", `${BRAND}\n${value(data.preparadoPor, BRAND)}`);

  footer(doc, data);
  doc.save(filenameFor(data));
}
