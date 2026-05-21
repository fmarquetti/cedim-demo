const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const AfipModule = require("@afipsdk/afip.js");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

const Afip = AfipModule.default || AfipModule;

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

let supabaseServerClient = null;
let cachedAfipDate = null;
const ARCA_INVOICES_BUCKET = "arca-invoices";

function envFlag(name, defaultValue = false) {
  const value = process.env[name];

  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "si", "sí"].includes(
    String(value).trim().toLowerCase(),
  );
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta configurar variable de entorno: ${name}`);
  }

  return value;
}

function cleanNumber(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function toMoney(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(2));
}

function assertMoneyClose(label, actual, expected) {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`${label} no cierra. actual=${actual}, esperado=${expected}`);
  }
}

function payloadNumber(value, fallback) {
  const number = Number(value);

  if (Number.isFinite(number) && number > 0) {
    return number;
  }

  return fallback;
}

function isTipoC(tipoComprobante) {
  return [11, 12, 13].includes(Number(tipoComprobante));
}

function isFactura(tipoComprobante) {
  return [1, 6, 11].includes(Number(tipoComprobante));
}

function isNotaDebito(tipoComprobante) {
  return [2, 7, 12].includes(Number(tipoComprobante));
}

function isNotaCredito(tipoComprobante) {
  return [3, 8, 13].includes(Number(tipoComprobante));
}

function getVoucherCategory(tipoComprobante) {
  if (isNotaCredito(tipoComprobante)) return "nota_credito";
  if (isNotaDebito(tipoComprobante)) return "nota_debito";
  if (isFactura(tipoComprobante)) return "factura";
  return "factura";
}

function getVoucherTitle(tipoComprobante) {
  const category = getVoucherCategory(tipoComprobante);

  if (category === "nota_credito") return "Nota de Credito";
  if (category === "nota_debito") return "Nota de Debito";
  return "Factura";
}

function requiresAssociatedVoucher(tipoComprobante) {
  return isNotaCredito(tipoComprobante) || isNotaDebito(tipoComprobante);
}

function getTodayAfipDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const [year, month, day] = formatter.format(new Date()).split("-");
  return Number(`${year}${month}${day}`);
}

function formatAfipDate(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const [year, month, day] = formatter.format(date).split("-");
  return Number(`${year}${month}${day}`);
}

async function readRemoteDate(url, method) {
  const response = await fetch(url, { method });
  const dateHeader = response.headers.get("date");

  if (!dateHeader) {
    throw new Error(`El endpoint ${url} no devolvió header Date.`);
  }

  return dateHeader;
}

async function getAfipCbteFch({ allowLocalFallback = false } = {}) {
  const override = cleanNumber(process.env.AFIPSDK_CBTE_FCH);

  if (override) {
    return {
      value: Number(override),
      source: "AFIPSDK_CBTE_FCH",
    };
  }

  if (cachedAfipDate) {
    return cachedAfipDate;
  }

  const environment = process.env.AFIPSDK_ENV || "dev";
  const afipUrl = environment === "prod"
    ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
    : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";

  const candidates = [
    { url: "https://app.afipsdk.com", method: "HEAD" },
    { url: "https://app.afipsdk.com", method: "GET" },
    { url: afipUrl, method: "HEAD" },
    { url: afipUrl, method: "GET" },
  ];

  const failures = [];

  for (const candidate of candidates) {
    try {
      const dateHeader = await readRemoteDate(candidate.url, candidate.method);

      cachedAfipDate = {
        value: formatAfipDate(new Date(dateHeader)),
        source: `${candidate.method} ${candidate.url} Date:${dateHeader}`,
      };

      return cachedAfipDate;
    } catch (error) {
      failures.push({
        ...candidate,
        error: serializeError(error),
      });
    }
  }

  console.warn("No se pudo leer Date header remoto", JSON.stringify(failures));

  if (!allowLocalFallback) {
    throw new Error(
      "No se pudo obtener fecha remota para CbteFch. Configurá AFIPSDK_CBTE_FCH=YYYYMMDD en server/.env.",
    );
  }

  cachedAfipDate = {
    value: getTodayAfipDate(),
    source: "local-clock",
  };

  return cachedAfipDate;
}

function getDocumentType(documento) {
  const digits = cleanNumber(documento);

  if (!digits || digits === "0") {
    return {
      DocTipo: 99,
      DocNro: 0,
    };
  }

  if (digits.length === 11) {
    return {
      DocTipo: 80,
      DocNro: Number(digits),
    };
  }

  return {
    DocTipo: 96,
    DocNro: Number(digits),
  };
}

function getCondicionIVAReceptorId(clienteIva) {
  const value = String(clienteIva || "").toLowerCase();

  if (value.includes("responsable")) return 1;
  if (value.includes("monotrib")) return 6;
  if (value.includes("exento")) return 4;
  if (value.includes("consumidor")) return 5;

  return 5;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload inválido.");
  }

  if (!payload.cliente_nombre?.trim()) {
    throw new Error("Falta cliente_nombre.");
  }

  if (!payload.cliente_documento?.trim()) {
    throw new Error("Falta cliente_documento.");
  }

  const total = toMoney(payload.importe_total);
  const neto = toMoney(payload.importe_neto);
  const iva = toMoney(payload.importe_iva);
  const tipoComprobante = Number(payloadNumber(payload.tipo_comprobante, 6));

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("El importe_total debe ser mayor a 0.");
  }

  if (requiresAssociatedVoucher(tipoComprobante)) {
    if (
      !payload.comprobante_asociado_tipo ||
      !payload.comprobante_asociado_punto_venta ||
      !payload.comprobante_asociado_numero
    ) {
      throw new Error(
        "Las notas de credito/debito requieren un comprobante asociado.",
      );
    }
  }

  if (isTipoC(tipoComprobante)) {
    if (iva !== 0) {
      throw new Error(
        "Factura C no discrimina IVA. Cargá IVA 0 y Total igual a Neto.",
      );
    }

    if (!Number.isFinite(neto) || neto <= 0) {
      throw new Error("El importe_neto debe ser mayor a 0.");
    }

    assertMoneyClose("importe_neto", neto, total);
    return;
  }

  assertMoneyClose("importe_neto + importe_iva", toMoney(neto + iva), total);
}

function buildVoucherData(payload, voucherNumber = null, options = {}) {
  const puntoVenta = Number(payloadNumber(payload.punto_venta, 1));
  const tipoComprobante = Number(payloadNumber(payload.tipo_comprobante, 6));
  const total = toMoney(payload.importe_total);
  const neto = toMoney(payload.importe_neto);
  const iva = toMoney(payload.importe_iva);
  const tipoC = isTipoC(tipoComprobante);
  const hasIva = iva > 0;
  const { DocTipo, DocNro } = getDocumentType(payload.cliente_documento);

  const data = {
    CantReg: 1,
    PtoVta: puntoVenta,
    CbteTipo: tipoComprobante,
    Concepto: 1,
    DocTipo,
    DocNro,
    ImpTotal: total,
    ImpTotConc: 0,
    ImpNeto: tipoC ? total : hasIva ? neto : 0,
    ImpOpEx: tipoC ? 0 : hasIva ? 0 : total,
    ImpIVA: tipoC ? 0 : iva,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: getCondicionIVAReceptorId(payload.cliente_iva),
  };

  if (!tipoC && hasIva) {
    data.Iva = [
      {
        Id: 5,
        BaseImp: neto,
        Importe: iva,
      },
    ];
  }

  if (requiresAssociatedVoucher(tipoComprobante)) {
    data.CbtesAsoc = [
      {
        Tipo: Number(payload.comprobante_asociado_tipo),
        PtoVta: Number(payload.comprobante_asociado_punto_venta),
        Nro: Number(payload.comprobante_asociado_numero),
      },
    ];
  }

  if (voucherNumber !== null && voucherNumber !== undefined) {
    data.CbteDesde = Number(voucherNumber);
    data.CbteHasta = Number(voucherNumber);
  }

  if (options.cbteFch) {
    data.CbteFch = Number(options.cbteFch);
  }

  return data;
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    return error;
  }

  return {
    message: String(error),
  };
}

function getVoucherLetter(tipoComprobante) {
  const labels = {
    1: "A",
    2: "A",
    3: "A",
    6: "B",
    7: "B",
    8: "B",
    11: "C",
    12: "C",
    13: "C",
  };

  return labels[Number(tipoComprobante)] || "B";
}

function formatDisplayDate(value) {
  if (!value) return "-";

  const raw = String(value);
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(0, 4)}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function voucherLabel(invoice) {
  const puntoVenta = String(invoice?.punto_venta || 0).padStart(4, "0");
  const numero = String(invoice?.numero_comprobante || 0).padStart(8, "0");

  return `${puntoVenta}-${numero}`;
}

function isAfipErrorCode(error, code) {
  if (!error) return false;

  if (Number(error.code) === code || Number(error.Code) === code) {
    return true;
  }

  return String(error.message || error).includes(`(${code})`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFirstKeyDeep(obj, targetKey) {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findFirstKeyDeep(item, targetKey);

      if (found !== null && found !== undefined && found !== "") {
        return found;
      }
    }

    return null;
  }

  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === targetKey.toLowerCase()) {
      const value = obj[key];

      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }
  }

  for (const key of Object.keys(obj)) {
    const found = findFirstKeyDeep(obj[key], targetKey);

    if (found !== null && found !== undefined && found !== "") {
      return found;
    }
  }

  return null;
}

function extractCbteFch(response) {
  const value = findFirstKeyDeep(response, "CbteFch");
  const parsed = Number(value || 0);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cloneVoucherData(data) {
  return JSON.parse(JSON.stringify(data));
}

function createAfipClient() {
  const accessToken = requiredEnv("AFIPSDK_ACCESS_TOKEN");
  const environment = process.env.AFIPSDK_ENV || "dev";
  const taxId = requiredEnv("AFIPSDK_TAX_ID");

  return new Afip({
    CUIT: Number(taxId),
    access_token: accessToken,
    production: environment === "prod",
  });
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn(
      "Supabase persistence disabled: missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
    return null;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "Supabase persistence is using anon key. Inserts can fail with RLS; set SUPABASE_SERVICE_ROLE_KEY in server/.env.",
    );
  }

  return {
    url,
    key,
    usesServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

function getSupabaseServerClient() {
  if (supabaseServerClient) {
    return supabaseServerClient;
  }

  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  supabaseServerClient = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseServerClient;
}

async function getAuthenticatedUser(req) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.replace("Bearer ", "");

  if (!jwt) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);

  if (error || !user) {
    console.warn(
      "Supabase user validation skipped",
      JSON.stringify({ message: error?.message || "Usuario no autenticado." }),
    );
    return null;
  }

  return user;
}

async function insertPendingInvoice(payload, userId) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const puntoVenta = Number(payloadNumber(payload.punto_venta, 1));
  const tipoComprobante = Number(payloadNumber(payload.tipo_comprobante, 6));

  const { data, error } = await supabase
    .from("arca_invoices")
    .insert({
      origen: "CEDIM",
      cliente_nombre: payload.cliente_nombre,
      cliente_documento: payload.cliente_documento,
      cliente_iva: payload.cliente_iva || "Consumidor Final",
      domicilio: payload.domicilio || "",
      concepto: payload.concepto || "Servicios médicos",
      descripcion: payload.descripcion || "",
      comprobante_categoria: getVoucherCategory(tipoComprobante),
      comprobante_asociado_id: payload.comprobante_asociado_id || null,
      comprobante_asociado_tipo: payload.comprobante_asociado_tipo
        ? Number(payload.comprobante_asociado_tipo)
        : null,
      comprobante_asociado_punto_venta: payload.comprobante_asociado_punto_venta
        ? Number(payload.comprobante_asociado_punto_venta)
        : null,
      comprobante_asociado_numero: payload.comprobante_asociado_numero
        ? Number(payload.comprobante_asociado_numero)
        : null,
      motivo: payload.motivo || null,
      tipo_comprobante: tipoComprobante,
      punto_venta: puntoVenta,
      importe_neto: toMoney(payload.importe_neto || 0),
      importe_iva: toMoney(payload.importe_iva || 0),
      importe_total: toMoney(payload.importe_total),
      estado: "procesando",
      proveedor: "afipsdk",
      created_by: userId || null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateInvoiceSuccess(invoiceId, parsed, response) {
  if (!invoiceId) {
    return null;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("arca_invoices")
    .update({
      numero_comprobante: parsed.numero_comprobante,
      cae: parsed.cae,
      cae_vencimiento: parsed.cae_vencimiento,
      estado: "emitida",
      proveedor_response: response,
      emitted_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateInvoiceError(invoiceId, message, response = null) {
  if (!invoiceId) return;

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from("arca_invoices")
    .update({
      estado: "error",
      proveedor_response: response,
      error_message: String(message || "").slice(0, 2000),
    })
    .eq("id", invoiceId);
}

function buildInvoicePdfBuffer(invoice, payloadOrResponse = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: `Factura ${voucherLabel(invoice)}`,
        Author: "CEDIM",
      },
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const voucherTitle = getVoucherTitle(invoice.tipo_comprobante);
    const typeLetter = getVoucherLetter(invoice.tipo_comprobante);
    const caeVencimiento =
      invoice.cae_vencimiento ||
      payloadOrResponse.CAEFchVto ||
      payloadOrResponse.cae_vencimiento ||
      "-";

    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("CEDIM", 48, 46)
      .fontSize(9)
      .font("Helvetica")
      .text(`${voucherTitle} emitido electronicamente`, 48, 76);

    doc
      .roundedRect(270, 44, 58, 58, 4)
      .stroke("#1f2937")
      .fontSize(30)
      .font("Helvetica-Bold")
      .text(typeLetter, 270, 58, { width: 58, align: "center" });

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Comprobante: ${voucherTitle}`, 360, 32)
      .text(`Punto de venta: ${invoice.punto_venta || "-"}`, 360, 50)
      .text(`Numero comprobante: ${voucherLabel(invoice)}`, 360, 68)
      .text(
        `Fecha emision: ${formatDisplayDate(invoice.emitted_at || invoice.created_at)}`,
        360,
        86,
      );

    doc.moveTo(48, 122).lineTo(547, 122).stroke("#d1d5db");

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Cliente", 48, 142)
      .fontSize(10)
      .font("Helvetica")
      .text(`Cliente: ${invoice.cliente_nombre || "-"}`, 48, 166)
      .text(`Documento: ${invoice.cliente_documento || "-"}`, 48, 184)
      .text(`Condicion IVA: ${invoice.cliente_iva || "Consumidor Final"}`, 48, 202)
      .text(`Domicilio: ${invoice.domicilio || "-"}`, 48, 220);

    if (
      invoice.comprobante_asociado_tipo ||
      invoice.comprobante_asociado_punto_venta ||
      invoice.comprobante_asociado_numero
    ) {
      doc
        .fontSize(9)
        .fillColor("#4b5563")
        .text(
          `Comprobante asociado: Tipo ${invoice.comprobante_asociado_tipo || "-"} - PV ${String(
            invoice.comprobante_asociado_punto_venta || 0,
          ).padStart(4, "0")} - Nro ${String(
            invoice.comprobante_asociado_numero || 0,
          ).padStart(8, "0")}`,
          48,
          238,
        )
        .fillColor("#111827");
    }

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Detalle", 48, 260);

    const tableTop = 286;
    doc.rect(48, tableTop, 499, 28).fill("#f3f6fa");
    doc
      .fillColor("#111827")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Concepto", 58, tableTop + 10, { width: 90 })
      .text("Descripcion", 150, tableTop + 10, { width: 190 })
      .text("Neto", 348, tableTop + 10, { width: 58, align: "right" })
      .text("IVA", 414, tableTop + 10, { width: 48, align: "right" })
      .text("Total", 470, tableTop + 10, { width: 66, align: "right" });

    doc.rect(48, tableTop + 28, 499, 52).stroke("#e5e7eb");
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(invoice.concepto || "-", 58, tableTop + 44, { width: 90 })
      .text(invoice.descripcion || "-", 150, tableTop + 44, { width: 190 })
      .text(formatMoney(invoice.importe_neto), 348, tableTop + 44, {
        width: 58,
        align: "right",
      })
      .text(formatMoney(invoice.importe_iva), 414, tableTop + 44, {
        width: 48,
        align: "right",
      })
      .text(formatMoney(invoice.importe_total), 470, tableTop + 44, {
        width: 66,
        align: "right",
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("Total", 360, tableTop + 110, { width: 80, align: "right" })
      .text(formatMoney(invoice.importe_total), 448, tableTop + 110, {
        width: 99,
        align: "right",
      });

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`CAE: ${invoice.cae || "-"}`, 48, tableTop + 150)
      .text(`Vencimiento CAE: ${formatDisplayDate(caeVencimiento)}`, 48, tableTop + 168);

    // TODO: agregar QR fiscal ARCA/AFIP cuando se defina el payload homologado.
    doc
      .fontSize(9)
      .fillColor("#6b7280")
      .text("Generado desde CEDIM", 48, 770, { align: "center", width: 499 });

    doc.end();
  });
}

async function uploadInvoicePdfToSupabase(invoice, pdfBuffer) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no configurado para guardar PDF.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY requerido para guardar PDF.");
  }

  const storagePath = `cedim/${invoice.id}/factura-${invoice.punto_venta}-${invoice.numero_comprobante}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(ARCA_INVOICES_BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(ARCA_INVOICES_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  let pdfUrl = signedData?.signedUrl || "";

  if (signedError || !pdfUrl) {
    const { data: publicData } = supabase.storage
      .from(ARCA_INVOICES_BUCKET)
      .getPublicUrl(storagePath);
    pdfUrl = publicData?.publicUrl || "";
  }

  const { data, error } = await supabase
    .from("arca_invoices")
    .update({
      pdf_storage_path: storagePath,
      pdf_url: pdfUrl,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getInvoiceById(invoiceId) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase no configurado.");
  }

  const { data, error } = await supabase
    .from("arca_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function createInvoiceSignedUrl(invoice) {
  if (!invoice?.pdf_storage_path) {
    throw new Error("PDF pendiente.");
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase no configurado.");
  }

  const { data, error } = await supabase.storage
    .from(ARCA_INVOICES_BUCKET)
    .createSignedUrl(invoice.pdf_storage_path, 60 * 60 * 24 * 7);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

async function logInvoiceEvent({
  invoiceId,
  eventType,
  userId,
  userEmail,
  targetEmail,
  metadata,
}) {
  if (!invoiceId || !eventType) return;

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { error } = await supabase.from("arca_invoice_events").insert({
      invoice_id: invoiceId,
      event_type: eventType,
      user_id: userId || null,
      user_email: userEmail || null,
      target_email: targetEmail || null,
      metadata: metadata || null,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn(
      "No se pudo registrar evento de factura ARCA",
      JSON.stringify(serializeError(error)),
    );
  }
}

async function touchInvoiceLastAction(invoiceId, action, userId) {
  if (!invoiceId || !action) return;

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { error } = await supabase
      .from("arca_invoices")
      .update({
        last_action: action,
        last_action_at: new Date().toISOString(),
        last_action_by: userId || null,
      })
      .eq("id", invoiceId);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn(
      "No se pudo actualizar ultima accion de factura ARCA",
      JSON.stringify(serializeError(error)),
    );
  }
}

async function downloadInvoicePdfBuffer(invoice) {
  if (!invoice?.pdf_storage_path) {
    throw new Error("PDF pendiente.");
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase no configurado.");
  }

  const { data: pdfData, error } = await supabase.storage
    .from(ARCA_INVOICES_BUCKET)
    .download(invoice.pdf_storage_path);

  if (error) {
    throw error;
  }

  return Buffer.from(await pdfData.arrayBuffer());
}

function getSmtpTransporter() {
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ];
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      "SMTP no configurado. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM.",
    );
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function extractInvoiceResult(response) {
  return {
    cae: response?.CAE || response?.cae || "",
    cae_vencimiento: response?.CAEFchVto || response?.cae_vencimiento || "",
    numero_comprobante:
      response?.voucher_number ||
      response?.voucherNumber ||
      response?.CbteDesde ||
      response?.cbte_desde ||
      null,
  };
}

async function consultVoucherAfter10016(afip, voucherNumber, salesPoint, type) {
  try {
    const response = await afip.ElectronicBilling.getVoucherInfo(
      voucherNumber,
      salesPoint,
      type,
    );

    return {
      ok: true,
      response,
    };
  } catch (error) {
    return {
      ok: false,
      error: serializeError(error),
    };
  }
}

async function createVoucherWithRetry(afip, payload) {
  const maxAttempts = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const baseData = buildVoucherData(payload);
    const cbteFch = await getAfipCbteFch();
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(
      baseData.PtoVta,
      baseData.CbteTipo,
    );
    const voucherNumber = Number(lastVoucher) + 1;
    let lastVoucherInfo = null;
    let lastVoucherDate = null;

    if (Number(lastVoucher) > 0) {
      lastVoucherInfo = await consultVoucherAfter10016(
        afip,
        Number(lastVoucher),
        baseData.PtoVta,
        baseData.CbteTipo,
      );

      if (lastVoucherInfo.ok) {
        lastVoucherDate = extractCbteFch(lastVoucherInfo.response);
      }
    }

    const effectiveCbteFch =
      lastVoucherDate && lastVoucherDate > cbteFch.value
        ? lastVoucherDate
        : cbteFch.value;
    const effectiveCbteFchSource =
      lastVoucherDate && lastVoucherDate > cbteFch.value
        ? `last-voucher-date:${lastVoucherDate}`
        : cbteFch.source;

    const data = buildVoucherData(payload, voucherNumber, {
      cbteFch: effectiveCbteFch,
    });
    const attemptDebug = {
      attempt,
      environment: process.env.AFIPSDK_ENV || "dev",
      taxId: process.env.AFIPSDK_TAX_ID,
      PtoVta: data.PtoVta,
      CbteTipo: data.CbteTipo,
      DocTipo: data.DocTipo,
      DocNro: data.DocNro,
      lastVoucher,
      voucherNumber,
      CbteFch: data.CbteFch,
      cbteFchSource: effectiveCbteFchSource,
      lastVoucherDate,
      ImpTotal: data.ImpTotal,
    };

    console.log(
      "ARCA createVoucher request",
      JSON.stringify(attemptDebug),
    );

    try {
      const response = await afip.ElectronicBilling.createVoucher(
        cloneVoucherData(data),
      );

      return {
        response,
        data,
        attempt,
        cbteFchSource: effectiveCbteFchSource,
        lastVoucher,
        lastVoucherDate,
        voucherNumber,
      };
    } catch (error) {
      lastError = error;

      if (!isAfipErrorCode(error, 10016)) {
        error.arcaDebug = attemptDebug;
        throw error;
      }

      const consulted = await consultVoucherAfter10016(
        afip,
        voucherNumber,
        baseData.PtoVta,
        baseData.CbteTipo,
      );
      error.arcaDebug = {
        ...attemptDebug,
        lastVoucherInfo,
        consulted,
      };

      if (attempt === maxAttempts) {
        throw error;
      }

      console.warn(
        "ARCA createVoucher 10016 retry",
        JSON.stringify({
          nextAttempt: attempt + 1,
          ...attemptDebug,
          lastVoucherInfo,
          consulted,
          message: error instanceof Error ? error.message : String(error),
        }),
      );

      await sleep(400);
    }
  }

  throw lastError;
}

app.get("/api/arca/health", (_req, res) => {
  const supabaseConfig = getSupabaseConfig();

  res.json({
    ok: true,
    service: "cedim-arca-server",
    environment: process.env.AFIPSDK_ENV || "dev",
    afipConfigured: Boolean(
      process.env.AFIPSDK_ACCESS_TOKEN && process.env.AFIPSDK_TAX_ID,
    ),
    supabaseConfigured: Boolean(supabaseConfig),
    supabaseUsesServiceRole: Boolean(supabaseConfig?.usesServiceRole),
  });
});

app.get("/api/arca/debug-date", async (_req, res) => {
  try {
    cachedAfipDate = null;
    const cbteFch = await getAfipCbteFch();

    res.json({
      ok: true,
      cbteFch,
      localClock: getTodayAfipDate(),
      override: cleanNumber(process.env.AFIPSDK_CBTE_FCH) || null,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      localClock: getTodayAfipDate(),
      override: cleanNumber(process.env.AFIPSDK_CBTE_FCH) || null,
    });
  }
});

app.post("/api/arca/emitir", async (req, res) => {
  let invoice = null;

  try {
    const payload = req.body;
    validatePayload(payload);

    const user = await getAuthenticatedUser(req);

    try {
      invoice = await insertPendingInvoice(payload, user?.id);
    } catch (dbError) {
      console.warn(
        "No se pudo registrar factura ARCA antes de emitir",
        JSON.stringify(serializeError(dbError)),
      );

      if (!envFlag("ARCA_ALLOW_EMIT_WITHOUT_DB")) {
        return res.status(400).json({
          ok: false,
          error:
            "No se pudo registrar la factura en Supabase antes de emitir. Revisá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en server/.env.",
          details: serializeError(dbError),
        });
      }
    }

    if (!invoice && !envFlag("ARCA_ALLOW_EMIT_WITHOUT_DB")) {
      return res.status(400).json({
        ok: false,
        error:
          "No se pudo registrar la factura en Supabase antes de emitir. Configurá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en server/.env.",
      });
    }

    const afip = createAfipClient();
    const {
      response,
      attempt,
      cbteFchSource,
      lastVoucher,
      lastVoucherDate,
      voucherNumber,
    } = await createVoucherWithRetry(afip, payload);
    const parsed = extractInvoiceResult(response);
    parsed.numero_comprobante = parsed.numero_comprobante || voucherNumber;
    const providerResponse = {
      ...response,
      voucher_number: parsed.numero_comprobante,
      cbte_fch_source: cbteFchSource,
      last_voucher: lastVoucher,
      last_voucher_date: lastVoucherDate,
    };

    if (!parsed.cae) {
      await updateInvoiceError(
        invoice?.id,
        "ARCA no devolvió CAE.",
        providerResponse,
      );

      return res.status(400).json({
        ok: false,
        error: "ARCA no devolvió CAE.",
        proveedor_response: providerResponse,
      });
    }

    let updatedInvoice = null;

    try {
      updatedInvoice = await updateInvoiceSuccess(
        invoice?.id,
        parsed,
        providerResponse,
      );
    } catch (dbError) {
      console.warn(
        "Factura emitida, pero no se pudo actualizar arca_invoices",
        JSON.stringify(serializeError(dbError)),
      );
    }

    let invoiceResponse = updatedInvoice || {
      ...invoice,
      cliente_nombre: payload.cliente_nombre,
      cliente_documento: payload.cliente_documento,
      cliente_iva: payload.cliente_iva || "Consumidor Final",
      domicilio: payload.domicilio || "",
      concepto: payload.concepto || "Servicios medicos",
      descripcion: payload.descripcion || "",
      comprobante_categoria: getVoucherCategory(payload.tipo_comprobante),
      comprobante_asociado_id: payload.comprobante_asociado_id || null,
      comprobante_asociado_tipo: payload.comprobante_asociado_tipo
        ? Number(payload.comprobante_asociado_tipo)
        : null,
      comprobante_asociado_punto_venta: payload.comprobante_asociado_punto_venta
        ? Number(payload.comprobante_asociado_punto_venta)
        : null,
      comprobante_asociado_numero: payload.comprobante_asociado_numero
        ? Number(payload.comprobante_asociado_numero)
        : null,
      motivo: payload.motivo || null,
      tipo_comprobante: Number(payloadNumber(payload.tipo_comprobante, 6)),
      punto_venta: Number(payloadNumber(payload.punto_venta, 1)),
      importe_neto: toMoney(payload.importe_neto || 0),
      importe_iva: toMoney(payload.importe_iva || 0),
      importe_total: toMoney(payload.importe_total),
      numero_comprobante: parsed.numero_comprobante,
      cae: parsed.cae,
      cae_vencimiento: parsed.cae_vencimiento,
      estado: "emitida",
      proveedor_response: providerResponse,
    };
    let warningPdf = null;

    await logInvoiceEvent({
      invoiceId: invoiceResponse?.id,
      eventType: "emitted",
      userId: user?.id,
      userEmail: user?.email,
      metadata: {
        cae: parsed.cae,
        numero_comprobante: parsed.numero_comprobante,
      },
    });
    await touchInvoiceLastAction(invoiceResponse?.id, "emitted", user?.id);

    try {
      if (!invoiceResponse?.id) {
        throw new Error("No hay id de factura para asociar el PDF.");
      }

      const pdfBuffer = await buildInvoicePdfBuffer(
        invoiceResponse,
        providerResponse,
      );
      invoiceResponse = await uploadInvoicePdfToSupabase(
        invoiceResponse,
        pdfBuffer,
      );
      await logInvoiceEvent({
        invoiceId: invoiceResponse?.id,
        eventType: "pdf_generated",
        userId: user?.id,
        userEmail: user?.email,
        metadata: {
          pdf_storage_path: invoiceResponse?.pdf_storage_path,
        },
      });
    } catch (pdfError) {
      warningPdf =
        pdfError instanceof Error ? pdfError.message : String(pdfError);
      invoiceResponse = {
        ...invoiceResponse,
        warning_pdf: warningPdf,
      };
      console.warn(
        "Factura emitida, pero no se pudo generar/subir PDF",
        JSON.stringify(serializeError(pdfError)),
      );
    }

    return res.json({
      ok: true,
      invoice: invoiceResponse,
      warning_pdf: warningPdf,
      cae: parsed.cae,
      cae_vencimiento: parsed.cae_vencimiento,
      numero_comprobante: parsed.numero_comprobante,
      proveedor_response: providerResponse,
      attempt,
      cbteFchSource,
      lastVoucher,
      lastVoucherDate,
      voucherNumber,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(
      "ARCA createVoucher error",
      JSON.stringify(serializeError(error)),
    );

    await updateInvoiceError(invoice?.id, message);

    return res.status(400).json({
      ok: false,
      error: message,
      debug: error?.arcaDebug || null,
    });
  }
});

app.get("/api/arca/invoices/:id/pdf-url", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    const invoice = await getInvoiceById(req.params.id);
    const pdfUrl = await createInvoiceSignedUrl(invoice);

    await logInvoiceEvent({
      invoiceId: invoice.id,
      eventType: "pdf_opened",
      userId: user?.id,
      userEmail: user?.email,
    });
    await touchInvoiceLastAction(invoice.id, "pdf_opened", user?.id);

    res.json({
      ok: true,
      pdf_url: pdfUrl,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/arca/invoices/:id/download", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    const invoice = await getInvoiceById(req.params.id);
    const pdfBuffer = await downloadInvoicePdfBuffer(invoice);
    const now = new Date().toISOString();
    const supabase = getSupabaseServerClient();

    try {
      const { error } = await supabase
        .from("arca_invoices")
        .update({
          pdf_downloaded_at: now,
          pdf_downloaded_by: user?.id || null,
          last_action: "pdf_downloaded",
          last_action_at: now,
          last_action_by: user?.id || null,
        })
        .eq("id", invoice.id);

      if (error) {
        throw error;
      }
    } catch (updateError) {
      console.warn(
        "No se pudo actualizar descarga de PDF ARCA",
        JSON.stringify(serializeError(updateError)),
      );
    }

    await logInvoiceEvent({
      invoiceId: invoice.id,
      eventType: "pdf_downloaded",
      userId: user?.id,
      userEmail: user?.email,
    });

    const filename = `factura-${String(invoice.punto_venta || 0).padStart(
      4,
      "0",
    )}-${String(invoice.numero_comprobante || 0).padStart(8, "0")}.pdf`;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/arca/invoices/:id/send-email", async (req, res) => {
  let invoice = null;
  let user = null;
  let email = "";

  try {
    user = await getAuthenticatedUser(req);
    email = String(req.body?.email || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Email de destino invalido.");
    }

    invoice = await getInvoiceById(req.params.id);

    if (!invoice?.pdf_storage_path) {
      throw new Error("PDF pendiente.");
    }

    const transporter = getSmtpTransporter();
    const supabase = getSupabaseServerClient();
    const pdfBuffer = await downloadInvoicePdfBuffer(invoice);
    const now = new Date().toISOString();

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: `Factura CEDIM ${voucherLabel(invoice)}`,
      text: `Adjuntamos la factura CEDIM ${voucherLabel(invoice)}. CAE: ${
        invoice.cae || "-"
      }.`,
      attachments: [
        {
          filename: `factura-${invoice.punto_venta}-${invoice.numero_comprobante}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    let updatedInvoice = invoice;

    try {
      const { data, error: updateError } = await supabase
        .from("arca_invoices")
        .update({
          email_sent_at: now,
          email_sent_to: email,
          last_action: "email_sent",
          last_action_at: now,
          last_action_by: user?.id || null,
        })
        .eq("id", invoice.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      updatedInvoice = data;
    } catch (updateError) {
      console.warn(
        "No se pudo actualizar envio por mail ARCA",
        JSON.stringify(serializeError(updateError)),
      );
    }

    await logInvoiceEvent({
      invoiceId: invoice.id,
      eventType: "email_sent",
      userId: user?.id,
      userEmail: user?.email,
      targetEmail: email,
    });

    res.json({
      ok: true,
      invoice: updatedInvoice,
    });
  } catch (error) {
    await logInvoiceEvent({
      invoiceId: invoice?.id || req.params.id,
      eventType: "email_failed",
      userId: user?.id,
      userEmail: user?.email,
      targetEmail: email || null,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    res.status(400).json({
      ok: false,
      error:
        error instanceof Error
          ? `No se pudo enviar la factura por mail. ${error.message}`
          : `No se pudo enviar la factura por mail. ${String(error)}`,
    });
  }
});

app.get("/api/arca/invoices/:id/events", async (req, res) => {
  try {
    await getAuthenticatedUser(req);

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      throw new Error("Supabase no configurado.");
    }

    const { data, error } = await supabase
      .from("arca_invoice_events")
      .select("*")
      .eq("invoice_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      ok: true,
      events: data || [],
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(port, () => {
  console.log(`ARCA server escuchando en http://localhost:${port}`);
});
