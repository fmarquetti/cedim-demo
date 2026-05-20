import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InvoicePayload = {
  cliente_nombre: string;
  cliente_documento: string;
  cliente_iva?: string;
  domicilio?: string;
  concepto?: string;
  descripcion?: string;
  importe_neto?: number;
  importe_iva?: number;
  importe_total: number;
  tipo_comprobante?: number;
  punto_venta?: number;
};

type LastVoucherResult = {
  lastVoucher: number;
  raw: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Falta configurar variable de entorno: ${name}`);
  }

  return value;
}

function cleanNumber(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function toMoney(value: unknown) {
  const number = Number(value || 0);
  return Number(number.toFixed(2));
}

function payloadNumber(value: unknown, fallback: number) {
  const number = Number(value);

  if (Number.isFinite(number) && number > 0) {
    return number;
  }

  return fallback;
}

function getTodayAfipDate() {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const day = parts.find((p) => p.type === "day")?.value || "01";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const year = parts.find((p) => p.type === "year")?.value || "2026";

  return Number(`${year}${month}${day}`);
}

function getDocumentType(documento: string) {
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

function getCondicionIVAReceptorId(clienteIva?: string) {
  const value = String(clienteIva || "").toLowerCase();

  if (value.includes("responsable")) return 1;
  if (value.includes("monotrib")) return 6;
  if (value.includes("exento")) return 4;
  if (value.includes("consumidor")) return 5;

  return 5;
}

function validatePayload(payload: InvoicePayload) {
  if (!payload.cliente_nombre?.trim()) {
    throw new Error("Falta cliente_nombre.");
  }

  if (!payload.cliente_documento?.trim()) {
    throw new Error("Falta cliente_documento.");
  }

  if (!payload.importe_total || Number(payload.importe_total) <= 0) {
    throw new Error("El importe_total debe ser mayor a 0.");
  }
}

function findFirstKeyDeep(obj: unknown, targetKey: string): unknown {
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

  const record = obj as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === targetKey.toLowerCase()) {
      const value = record[key];

      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }
  }

  for (const key of Object.keys(record)) {
    const found = findFirstKeyDeep(record[key], targetKey);

    if (found !== null && found !== undefined && found !== "") {
      return found;
    }
  }

  return null;
}

function extractAfipErrors(response: unknown) {
  const errors = findFirstKeyDeep(response, "Errors");
  const observaciones = findFirstKeyDeep(response, "Observaciones");
  const eventos = findFirstKeyDeep(response, "Events");
  const resultado = findFirstKeyDeep(response, "Resultado");

  return {
    resultado: resultado ? String(resultado) : "",
    errors,
    observaciones,
    eventos,
  };
}

function extractCAE(response: Record<string, unknown>) {
  const cae = findFirstKeyDeep(response, "CAE");
  const caeVencimiento = findFirstKeyDeep(response, "CAEFchVto");
  const cbteDesde = findFirstKeyDeep(response, "CbteDesde");
  const resultado = findFirstKeyDeep(response, "Resultado");

  return {
    cae: cae ? String(cae) : "",
    cae_vencimiento: caeVencimiento ? String(caeVencimiento) : "",
    cbte_desde: cbteDesde ? Number(cbteDesde) : null,
    resultado: resultado ? String(resultado) : "",
    afip_errors: extractAfipErrors(response),
    raw: response,
  };
}

function responseHasAfipErrorCode(response: unknown, code: number) {
  const errors = findFirstKeyDeep(response, "Err");

  if (Array.isArray(errors)) {
    return errors.some((err) => {
      const record = err as Record<string, unknown>;
      return Number(record.Code) === code;
    });
  }

  const singleCode = findFirstKeyDeep(response, "Code");

  return Number(singleCode) === code;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function afipSdkAuth() {
  const accessToken = requiredEnv("AFIPSDK_ACCESS_TOKEN");
  const environment = Deno.env.get("AFIPSDK_ENV") || "dev";
  const taxId = Deno.env.get("AFIPSDK_TAX_ID") || "20409378472";
  const cert = Deno.env.get("AFIPSDK_CERT");
  const key = Deno.env.get("AFIPSDK_KEY");

  const body: Record<string, unknown> = {
    environment,
    tax_id: taxId,
    wsid: "wsfe",
  };

  if (cert && key) {
    body.cert = cert;
    body.key = key;
  }

  const response = await fetch("https://app.afipsdk.com/api/v1/afip/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await parseResponse(response);

  console.log(
    "AFIPSDK AUTH RESPONSE",
    JSON.stringify({
      status: response.status,
      ok: response.ok,
      data,
    }),
  );

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        data?.raw ||
        "No se pudo obtener autorización desde Afip SDK.",
    );
  }

  return {
    token: data.token,
    sign: data.sign,
    taxId,
    environment,
    accessToken,
  };
}

async function afipSdkRequest(args: {
  accessToken: string;
  environment: string;
  method: string;
  params: Record<string, unknown>;
}) {
  const requestBody = {
    environment: args.environment,
    wsid: "wsfe",
    method: args.method,
    params: args.params,
  };

  console.log(
    "AFIPSDK REQUEST",
    JSON.stringify({
      method: args.method,
      environment: args.environment,
      wsid: "wsfe",
      requestBody,
    }),
  );

  const response = await fetch("https://app.afipsdk.com/api/v1/afip/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await parseResponse(response);

  console.log(
    "AFIPSDK RESPONSE",
    JSON.stringify({
      method: args.method,
      status: response.status,
      ok: response.ok,
      data,
    }),
  );

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        data?.raw ||
        `Error llamando método ARCA ${args.method}. Status ${response.status}.`,
    );
  }

  return data;
}

async function getLastVoucher(params: {
  accessToken: string;
  environment: string;
  token: string;
  sign: string;
  taxId: string;
  puntoVenta: number;
  tipoComprobante: number;
}): Promise<LastVoucherResult> {
  const data = await afipSdkRequest({
    accessToken: params.accessToken,
    environment: params.environment,
    method: "FECompUltimoAutorizado",
    params: {
      Auth: {
        Token: params.token,
        Sign: params.sign,
        Cuit: String(params.taxId),
      },
      PtoVta: params.puntoVenta,
      CbteTipo: params.tipoComprobante,
    },
  });

  console.log("FECompUltimoAutorizado RAW", JSON.stringify(data));

  const result =
    data?.FECompUltimoAutorizadoResult ||
    data?.soapBody?.FECompUltimoAutorizadoResponse
      ?.FECompUltimoAutorizadoResult ||
    data?.body?.FECompUltimoAutorizadoResponse
      ?.FECompUltimoAutorizadoResult ||
    data?.response?.FECompUltimoAutorizadoResult ||
    data;

  const cbteNro =
    result?.CbteNro ??
    result?.cbteNro ??
    result?.cbte_nro ??
    findFirstKeyDeep(data, "CbteNro") ??
    findFirstKeyDeep(data, "cbteNro") ??
    0;

  const parsed = Number(cbteNro || 0);

  console.log(
    "FECompUltimoAutorizado PARSED",
    JSON.stringify({
      puntoVenta: params.puntoVenta,
      tipoComprobante: params.tipoComprobante,
      cbteNro,
      parsed,
      nextNumber: parsed + 1,
      raw: data,
    }),
  );

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `No se pudo interpretar FECompUltimoAutorizado. Respuesta: ${JSON.stringify(
        data,
      )}`,
    );
  }

  return {
    lastVoucher: parsed,
    raw: data,
  };
}

async function createCAE(params: {
  accessToken: string;
  environment: string;
  token: string;
  sign: string;
  taxId: string;
  payload: InvoicePayload;
  nextNumber: number;
}) {
  const puntoVenta = Number(payloadNumber(params.payload.punto_venta, 1));
  const tipoComprobante = Number(payloadNumber(params.payload.tipo_comprobante, 6));

  const total = toMoney(params.payload.importe_total);
  const iva = toMoney(params.payload.importe_iva || 0);

  let neto = toMoney(params.payload.importe_neto || total - iva);
  let exento = 0;

  const hasIva = iva > 0;

  if (!hasIva) {
    neto = 0;
    exento = total;
  }

  const { DocTipo, DocNro } = getDocumentType(params.payload.cliente_documento);
  const date = getTodayAfipDate();

  const detail: Record<string, unknown> = {
    Concepto: 1,
    DocTipo,
    DocNro,
    CbteDesde: params.nextNumber,
    CbteHasta: params.nextNumber,
    CbteFch: date,
    ImpTotal: total,
    ImpTotConc: 0,
    ImpNeto: neto,
    ImpOpEx: exento,
    ImpIVA: iva,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: getCondicionIVAReceptorId(
      params.payload.cliente_iva,
    ),
  };

  if (hasIva) {
    detail.Iva = {
      AlicIva: [
        {
          Id: 5,
          BaseImp: neto,
          Importe: iva,
        },
      ],
    };
  }

  console.log(
    "FECAESolicitar DETAIL",
    JSON.stringify({
      puntoVenta,
      tipoComprobante,
      nextNumber: params.nextNumber,
      detail,
    }),
  );

  const requestParams = {
    Auth: {
      Token: params.token,
      Sign: params.sign,
      Cuit: String(params.taxId),
    },
    FeCAEReq: {
      FeCabReq: {
        CantReg: 1,
        PtoVta: puntoVenta,
        CbteTipo: tipoComprobante,
      },
      FeDetReq: {
        FECAEDetRequest: detail,
      },
    },
  };

  const response = await afipSdkRequest({
    accessToken: params.accessToken,
    environment: params.environment,
    method: "FECAESolicitar",
    params: requestParams,
  });

  return {
    response,
    sent: {
      puntoVenta,
      tipoComprobante,
      nextNumber: params.nextNumber,
      detail,
      requestParams,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Método no permitido." }, 405);
  }

  let invoiceId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  let debugData: Record<string, unknown> = {};

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

    supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return jsonResponse(
        {
          ok: false,
          error: "Usuario no autenticado.",
          detail: userError?.message || null,
        },
        401,
      );
    }

    const payload = (await req.json()) as InvoicePayload;
    validatePayload(payload);

    const puntoVenta = Number(payloadNumber(payload.punto_venta, 1));
    const tipoComprobante = Number(payloadNumber(payload.tipo_comprobante, 6));

    debugData = {
      puntoVenta,
      tipoComprobante,
      payload,
      cbteFch: getTodayAfipDate(),
    };

    const pendingInsert = await supabase
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
        created_by: user.id,
      })
      .select()
      .single();

    if (pendingInsert.error) {
      throw pendingInsert.error;
    }

    invoiceId = pendingInsert.data.id;

    const auth = await afipSdkAuth();

    debugData = {
      ...debugData,
      environment: auth.environment,
      taxId: auth.taxId,
    };

    let parsed: ReturnType<typeof extractCAE> | null = null;
    let lastVoucherResult: LastVoucherResult | null = null;
    let lastVoucher = 0;
    let nextNumber = 0;
    let caeResponse: Record<string, unknown> | null = null;

    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastVoucherResult = await getLastVoucher({
        ...auth,
        puntoVenta,
        tipoComprobante,
      });

      lastVoucher = lastVoucherResult.lastVoucher;
      nextNumber = lastVoucher + 1;

      if (!Number.isFinite(nextNumber) || nextNumber <= 0) {
        throw new Error(
          `Número de comprobante inválido. lastVoucher=${lastVoucher}, nextNumber=${nextNumber}`,
        );
      }

      debugData = {
        ...debugData,
        attempt,
        lastVoucher,
        nextNumber,
        cbteFch: getTodayAfipDate(),
        lastVoucherRaw: lastVoucherResult.raw,
      };

      console.log(
        "NEXT VOUCHER ATTEMPT",
        JSON.stringify({
          attempt,
          puntoVenta,
          tipoComprobante,
          lastVoucher,
          nextNumber,
          cbteFch: getTodayAfipDate(),
          lastVoucherRaw: lastVoucherResult.raw,
        }),
      );

      const caeResult = await createCAE({
        ...auth,
        payload,
        nextNumber,
      });

      caeResponse = caeResult.response as Record<string, unknown>;
      parsed = extractCAE(caeResponse);

      debugData = {
        ...debugData,
        sentToAfip: caeResult.sent,
        parsed,
      };

      console.log("CAE PARSED", JSON.stringify(parsed));

      if (parsed.cae) {
        break;
      }

      const hasNumberError = responseHasAfipErrorCode(caeResponse, 10016);

      if (!hasNumberError || attempt === maxAttempts) {
        break;
      }

      console.log(
        "AFIP ERROR 10016 - RETRYING WITH NEW LAST VOUCHER",
        JSON.stringify({
          attempt,
          nextAttempt: attempt + 1,
          lastVoucher,
          nextNumber,
        }),
      );

      await sleep(400);
    }

    if (!parsed || !parsed.cae) {
      const afipErrorMessage =
        JSON.stringify(parsed?.afip_errors || parsed?.raw || caeResponse) || "";

      await supabase
        .from("arca_invoices")
        .update({
          numero_comprobante: nextNumber,
          estado: "error",
          proveedor_response: parsed?.raw || caeResponse,
          error_message: afipErrorMessage.slice(0, 2000),
        })
        .eq("id", invoiceId);

      return jsonResponse(
        {
          ok: false,
          error: `ARCA no devolvió CAE. Resultado: ${
            parsed?.resultado || "-"
          }. Detalle: ${afipErrorMessage}`,
          invoice_id: invoiceId,
          afip_response: parsed?.raw || caeResponse,
          afip_errors: parsed?.afip_errors || null,
          debug: debugData,
        },
        400,
      );
    }

    const updateResult = await supabase
      .from("arca_invoices")
      .update({
        numero_comprobante: parsed.cbte_desde || nextNumber,
        cae: parsed.cae,
        cae_vencimiento: parsed.cae_vencimiento,
        estado: "emitida",
        proveedor_response: parsed.raw,
        emitted_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .select()
      .single();

    if (updateResult.error) {
      throw updateResult.error;
    }

    return jsonResponse({
      ok: true,
      invoice: updateResult.data,
      afip_response: parsed.raw,
      debug: debugData,
    });
  } catch (error) {
    console.error("ARCA EDGE FUNCTION ERROR", error);

    const message = error instanceof Error ? error.message : String(error);

    if (supabase && invoiceId) {
      await supabase
        .from("arca_invoices")
        .update({
          estado: "error",
          error_message: message.slice(0, 2000),
        })
        .eq("id", invoiceId);
    }

    return jsonResponse(
      {
        ok: false,
        error: message,
        invoice_id: invoiceId,
        debug: debugData,
      },
      400,
    );
  }
});
