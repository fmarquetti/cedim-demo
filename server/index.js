const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const AfipModule = require("@afipsdk/afip.js");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

const Afip = AfipModule.default || AfipModule;

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

let supabaseServerClient = null;
let cachedAfipDate = null;

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

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("El importe_total debe ser mayor a 0.");
  }

  assertMoneyClose("importe_neto + importe_iva", toMoney(neto + iva), total);
}

function buildVoucherData(payload, voucherNumber = null, options = {}) {
  const puntoVenta = Number(payloadNumber(payload.punto_venta, 1));
  const tipoComprobante = Number(payloadNumber(payload.tipo_comprobante, 6));
  const total = toMoney(payload.importe_total);
  const neto = toMoney(payload.importe_neto);
  const iva = toMoney(payload.importe_iva);
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
    ImpNeto: hasIva ? neto : 0,
    ImpOpEx: hasIva ? 0 : total,
    ImpIVA: iva,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: getCondicionIVAReceptorId(payload.cliente_iva),
  };

  if (hasIva) {
    data.Iva = [
      {
        Id: 5,
        BaseImp: neto,
        Importe: iva,
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

    const invoiceResponse = updatedInvoice || {
      ...invoice,
      cliente_nombre: payload.cliente_nombre,
      cliente_documento: payload.cliente_documento,
      cliente_iva: payload.cliente_iva || "Consumidor Final",
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

    return res.json({
      ok: true,
      invoice: invoiceResponse,
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

app.listen(port, () => {
  console.log(`ARCA server escuchando en http://localhost:${port}`);
});
