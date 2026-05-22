import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return normalizeCell(value.result);
    if ("text" in value) return normalizeCell(value.text);
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value && "text" in value) return value.text;
  }
  return value;
}

function rowsToObjects(rawRows) {
  const [headerRow = [], ...dataRows] = rawRows;
  const headers = headerRow.map(normalizeHeader).filter(Boolean);

  const rows = dataRows
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = normalizeCell(row[index]);
      });
      return item;
    })
    .filter((row) => Object.values(row).some((value) => String(value || "").trim() !== ""));

  return { headers, rows };
}

export async function readExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  const rawRows = [];
  worksheet.eachRow((row) => {
    rawRows.push(row.values.slice(1).map(normalizeCell));
  });

  return rowsToObjects(rawRows);
}

function splitCsvLine(line, separator) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

export function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
      const firstLine = lines[0] || "";
      const separator = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
      resolve(rowsToObjects(lines.map((line) => splitCsvLine(line, separator))));
    };
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer el CSV."));
    reader.readAsText(file, "utf-8");
  });
}

export function parseMoney(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number(value.toFixed(2));

  let text = String(value).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!text) return 0;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (hasComma) {
    text = text.replace(",", ".");
  }

  const number = Number(text);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

export function parseDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }

  if (typeof value === "number") {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86400000).toISOString().split("T")[0];
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
}

export async function downloadTemplate(filename, rows) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Plantilla");
    const headers = Object.keys(rows?.[0] || {});

    sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, header.length + 4) }));
    sheet.addRows(rows || []);
    sheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), filename);
  } catch (error) {
    console.error("Error descargando plantilla:", error);
    throw new Error("No se pudo descargar la plantilla.");
  }
}
