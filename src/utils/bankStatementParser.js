// src/utils/bankStatementParser.js
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

const MONTHS_ES = {
  ene: "01",
  enero: "01",
  feb: "02",
  febrero: "02",
  mar: "03",
  marzo: "03",
  abr: "04",
  abril: "04",
  may: "05",
  mayo: "05",
  jun: "06",
  junio: "06",
  jul: "07",
  julio: "07",
  ago: "08",
  agosto: "08",
  sep: "09",
  set: "09",
  septiembre: "09",
  setiembre: "09",
  oct: "10",
  octubre: "10",
  nov: "11",
  noviembre: "11",
  dic: "12",
  diciembre: "12",
};

function normalizeText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForDetection(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeHashPart(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(text || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildBankMovementHash(mov) {
  const base = [
    normalizeHashPart(mov.banco),
    normalizeHashPart(mov.cuentaDetectada || mov.cuenta),
    normalizeHashPart(mov.fecha),
    normalizeHashPart(mov.tipo),
    normalizeHashPart(mov.descripcion),
    Number(mov.importe || 0).toFixed(2),
    Number(mov.saldo || 0).toFixed(2),
  ].join("|");

  return sha256(base);
}

function parseMoney(value) {
  if (value === null || value === undefined) return null;

  const clean = String(value)
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number(clean);

  if (Number.isNaN(number)) return null;

  return number;
}

function parseSignedMoney(value) {
  if (!value) return null;
  const str = String(value).trim();
  const number = parseMoney(str);
  if (number === null) return null;
  return str.startsWith("-") ? -Math.abs(number) : number;
}

function parseDateToISO(value) {
  if (!value) return "";

  const clean = String(value).trim();

  const slash = clean.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (slash) {
    const [, dd, mm, yy] = slash;
    const yyyy = yy.length === 2 ? `20${yy}` : yy;
    return `${yyyy}-${mm}-${dd}`;
  }

  const dashMonth = clean.match(/^(\d{2})-([A-Za-zÁÉÍÓÚáéíóúñÑ]{3,})-(\d{2,4})$/);
  if (dashMonth) {
    const [, dd, monthName, yy] = dashMonth;
    const monthKey = monthName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const mm = MONTHS_ES[monthKey] || MONTHS_ES[monthKey.slice(0, 3)];
    const yyyy = yy.length === 2 ? `20${yy}` : yy;
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }

  const shortSlash = clean.match(/^(\d{2})\/(\d{2})$/);
  if (shortSlash) {
    const [, dd, mm] = shortSlash;
    const currentYear = new Date().getFullYear();
    return `${currentYear}-${mm}-${dd}`;
  }

  return clean;
}

function compactLines(text) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isMoneyToken(value) {
  return /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(String(value || "").trim());
}

function isDateLine(value) {
  return /^(\d{2}\/\d{2}\/\d{2,4}|\d{2}\/\d{2}|\d{2}-[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}-\d{2,4})$/.test(
    String(value || "").trim()
  );
}

function isIgnoredLine(line) {
  const t = normalizeForDetection(line);

  return (
    t.includes("SALDO ANTERIOR") ||
    t.includes("SALDO FINAL") ||
    t.includes("SALDO AL ") ||
    t.includes("TOTAL MOVIMIENTOS") ||
    t.startsWith("TOTAL $") ||
    t.startsWith("TOTAL COBRADO") ||
    t.includes("TOTAL RETENCION") ||
    t.includes("CONSOLIDADO DE RETENCION") ||
    t.includes("IMPUESTO A LOS DEBITOS") ||
    t.includes("TRANSFERENCIAS") ||
    t.includes("RECIBIDAS") ||
    t.includes("ENVIADAS") ||
    t.includes("DEBITOS AUTOMATICOS") ||
    t.includes("LEGALES") ||
    t.includes("CANALES DE ATENCION")
  );
}

function buildMovement({ banco, cuentaDetectada, fecha, descripcion, debito, credito, saldo, origen }) {
  const debitoNumber = Number(debito || 0);
  const creditoNumber = Number(credito || 0);

  const tipo = debitoNumber > 0 ? "Egreso" : "Ingreso";
  const importe = debitoNumber > 0 ? debitoNumber : creditoNumber;

  return {
    banco,
    cuentaDetectada: cuentaDetectada || "",
    fecha,
    tipo,
    descripcion: String(descripcion || "").replace(/\s+/g, " ").trim(),
    importe,
    debito: debitoNumber,
    credito: creditoNumber,
    saldo: Number(saldo || 0),
    origen: origen || `Extracto ${banco}`,
    estado: "Pendiente",
  };
}

export async function extractTextFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const items = content.items
      .map((item) => ({
        text: item.str,
        x: item.transform?.[4] || 0,
        y: Math.round(item.transform?.[5] || 0),
      }))
      .filter((item) => item.text && item.text.trim());

    const rows = new Map();

    items.forEach((item) => {
      const key = item.y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(item);
    });

    const pageText = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, rowItems]) =>
        rowItems
          .sort((a, b) => a.x - b.x)
          .map((item) => item.text)
          .join(" ")
      )
      .join("\n");

    pages.push(pageText);
  }

  return normalizeText(pages.join("\n"));
}

export function detectBankStatement(text) {
  const t = normalizeForDetection(text);

  if (t.includes("BANCO GALICIA") && t.includes("RESUMEN DE CUENTA CORRIENTE")) {
    return {
      banco: "Galicia",
      tipoDocumento: "cuenta_corriente",
      parser: "galicia_cuenta",
    };
  }

  if (t.includes("BANCO BBVA ARGENTINA") && t.includes("MOVIMIENTOS EN CUENTAS")) {
    return {
      banco: "BBVA",
      tipoDocumento: "cuenta_corriente",
      parser: "bbva_cuenta",
    };
  }

  if (t.includes("BANCO MACRO") && t.includes("DETALLE DE MOVIMIENTO")) {
    return {
      banco: "Macro",
      tipoDocumento: "cuenta_corriente",
      parser: "macro_cuenta",
    };
  }

  if (t.includes("TARJETAS DE CREDITO") || t.includes("TARJETA DE CREDITO")) {
    return {
      banco: t.includes("BBVA") ? "BBVA" : "Tarjeta",
      tipoDocumento: "tarjeta_credito",
      parser: "no_soportado",
    };
  }

  if (t.includes("FIMA") || t.includes("FONDOS COMUNES DE INVERSION")) {
    return {
      banco: t.includes("GALICIA") ? "Galicia" : "Inversiones",
      tipoDocumento: "inversiones",
      parser: "no_soportado",
    };
  }

  return {
    banco: "Desconocido",
    tipoDocumento: "desconocido",
    parser: "desconocido",
  };
}

function extractGaliciaAccount(text) {
  const account = text.match(/Número de cuenta\s*N[°º]?\s*([0-9\-\s]+)\n/i);
  const cbu = text.match(/CBU\s*([0-9]{18,24})/i);

  return {
    cuenta: account?.[1]?.replace(/\s+/g, " ").trim() || "",
    cbu: cbu?.[1] || "",
  };
}

function parseGaliciaCuenta(text) {
  const lines = compactLines(text);
  const account = extractGaliciaAccount(text);
  const movements = [];

  let inside = false;
  let current = null;

  const flush = () => {
    if (!current) return;

    const amounts = current.amounts;
    if (amounts.length < 2) {
      current = null;
      return;
    }

    const saldoRaw = amounts[amounts.length - 1];
    const movimientoRaw = amounts[amounts.length - 2];

    const saldo = parseSignedMoney(saldoRaw);
    const signedAmount = parseSignedMoney(movimientoRaw);

    if (saldo === null || signedAmount === null || signedAmount === 0) {
      current = null;
      return;
    }

    const debito = signedAmount < 0 ? Math.abs(signedAmount) : 0;
    const credito = signedAmount > 0 ? signedAmount : 0;

    movements.push(
      buildMovement({
        banco: "Galicia",
        cuentaDetectada: account.cuenta || account.cbu,
        fecha: parseDateToISO(current.fecha),
        descripcion: current.descriptionLines.join(" "),
        debito,
        credito,
        saldo,
        origen: "Extracto Galicia",
      })
    );

    current = null;
  };

  for (const line of lines) {
    const upper = normalizeForDetection(line);

    if (upper.includes("FECHA DESCRIPCION ORIGEN CREDITO DEBITO SALDO")) {
      inside = true;
      continue;
    }

    if (!inside) continue;

    if (
      upper.startsWith("TOTAL $") ||
      upper.includes("CONSOLIDADO DE RETENCION") ||
      upper.includes("LOS DEPOSITOS EN PESOS") ||
      upper.includes("CANALES DE ATENCION")
    ) {
      flush();
      break;
    }

    if (isIgnoredLine(line)) {
      flush();
      continue;
    }

    if (isDateLine(line)) {
      flush();
      current = {
        fecha: line,
        descriptionLines: [],
        amounts: [],
      };
      continue;
    }

    if (!current) continue;

    if (isMoneyToken(line)) {
      current.amounts.push(line);
    } else {
      current.descriptionLines.push(line);
    }
  }

  flush();

  return {
    banco: "Galicia",
    cuentaDetectada: account.cuenta || account.cbu,
    cbuDetectado: account.cbu,
    movimientos: movements.filter((mov) => mov.importe > 0 && mov.descripcion),
  };
}

function extractBbvaAccount(text) {
  const account = text.match(/CC \$\s*([0-9\-\/]+)\s*\(Cta\.Cte\.Bancaria\)/i);
  const cbu = text.match(/CBU\s*([0-9 ]{18,30})/i);

  return {
    cuenta: account?.[1] || "",
    cbu: cbu?.[1]?.replace(/\s+/g, "") || "",
  };
}

function parseBbvaCuenta(text) {
  const lines = compactLines(text);
  const account = extractBbvaAccount(text);
  const movements = [];

  let inside = false;

  const rowRegex =
    /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;

  for (const line of lines) {
    const upper = normalizeForDetection(line);

    if (upper.includes("FECHA ORIGEN CONCEPTO DEBITO CREDITO SALDO")) {
      inside = true;
      continue;
    }

    if (!inside) continue;

    if (
      upper.includes("SALDO AL ") ||
      upper.includes("TOTAL MOVIMIENTOS") ||
      upper.includes("IMPUESTO A LOS DEBITOS") ||
      upper === "TRANSFERENCIAS" ||
      upper.includes("RECIBIDAS")
    ) {
      if (upper.includes("TRANSFERENCIAS") || upper.includes("IMPUESTO A LOS DEBITOS")) break;
      continue;
    }

    const match = line.match(rowRegex);
    if (!match) continue;

    const [, fechaRaw, descriptionRaw, amountRaw, saldoRaw] = match;

    if (descriptionRaw.toUpperCase().includes("SALDO ANTERIOR")) continue;

    const signedAmount = parseSignedMoney(amountRaw);
    const saldo = parseSignedMoney(saldoRaw);

    if (signedAmount === null || saldo === null || signedAmount === 0) continue;

    const debito = signedAmount < 0 ? Math.abs(signedAmount) : 0;
    const credito = signedAmount > 0 ? signedAmount : 0;

    movements.push(
      buildMovement({
        banco: "BBVA",
        cuentaDetectada: account.cuenta || account.cbu,
        fecha: parseDateToISO(fechaRaw),
        descripcion: descriptionRaw,
        debito,
        credito,
        saldo,
        origen: "Extracto BBVA",
      })
    );
  }

  return {
    banco: "BBVA",
    cuentaDetectada: account.cuenta || account.cbu,
    cbuDetectado: account.cbu,
    movimientos: movements.filter((mov) => mov.importe > 0 && mov.descripcion),
  };
}

function extractMacroAccount(text) {
  const account = text.match(/CUENTA CORRIENTE BANCARIA NRO\.:\s*([0-9\-]+)/i);
  const cbu = text.match(/Clave Bancaria Uniforme para Debito Directo:\s*([0-9\-]+)/i);

  return {
    cuenta: account?.[1] || "",
    cbu: cbu?.[1] || "",
  };
}

function parseMacroCuenta(text) {
  const lines = compactLines(text);
  const account = extractMacroAccount(text);
  const movements = [];

  let inside = false;

  const rowRegex =
    /^(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(\d+)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/;

  for (const line of lines) {
    const upper = normalizeForDetection(line);

    if (upper.includes("FECHA DESCRIPCION REFERENCIA DEBITOS CREDITOS SALDO")) {
      inside = true;
      continue;
    }

    if (!inside) continue;

    if (
      upper.includes("SALDO FINAL") ||
      upper.includes("TOTAL COBRADO") ||
      upper.includes("LOS DEPOSITOS EN PESOS") ||
      upper.includes("EL PRESENTE EXTRACTO")
    ) {
      if (upper.includes("LOS DEPOSITOS EN PESOS") || upper.includes("EL PRESENTE EXTRACTO")) {
        break;
      }
      continue;
    }

    if (upper.includes("SALDO ULTIMO EXTRACTO")) continue;

    const match = line.match(rowRegex);
    if (!match) continue;

    const [, fechaRaw, descriptionRaw, referencia, amountRaw, saldoRaw] = match;

    const saldo = parseMoney(saldoRaw);
    const amount = parseMoney(amountRaw);

    if (amount === null || saldo === null || amount === 0) continue;

    const previousSaldo = movements.length
      ? movements[movements.length - 1].saldo
      : null;

    let debito = 0;
    let credito = 0;

    if (previousSaldo !== null) {
      if (saldo < previousSaldo) debito = amount;
      else credito = amount;
    } else {
      const descriptionUpper = normalizeForDetection(descriptionRaw);
      if (
        descriptionUpper.startsWith("N/D") ||
        descriptionUpper.includes("IMP.") ||
        descriptionUpper.includes("COMISION") ||
        descriptionUpper.includes("ECOGAS") ||
        descriptionUpper.includes("TRANSF:")
      ) {
        debito = amount;
      } else {
        credito = amount;
      }
    }

    movements.push(
      buildMovement({
        banco: "Macro",
        cuentaDetectada: account.cuenta || account.cbu,
        fecha: parseDateToISO(fechaRaw),
        descripcion: `${descriptionRaw} Ref. ${referencia}`,
        debito,
        credito,
        saldo,
        origen: "Extracto Macro",
      })
    );
  }

  return {
    banco: "Macro",
    cuentaDetectada: account.cuenta || account.cbu,
    cbuDetectado: account.cbu,
    movimientos: movements.filter((mov) => mov.importe > 0 && mov.descripcion),
  };
}

export function parseBankStatement(text) {
  const detected = detectBankStatement(text);

  if (detected.parser === "galicia_cuenta") {
    return {
      detected,
      ...parseGaliciaCuenta(text),
    };
  }

  if (detected.parser === "bbva_cuenta") {
    return {
      detected,
      ...parseBbvaCuenta(text),
    };
  }

  if (detected.parser === "macro_cuenta") {
    return {
      detected,
      ...parseMacroCuenta(text),
    };
  }

  return {
    detected,
    banco: detected.banco,
    cuentaDetectada: "",
    cbuDetectado: "",
    movimientos: [],
    error:
      detected.parser === "no_soportado"
        ? `El documento fue detectado como ${detected.tipoDocumento}, pero este flujo solo importa cuentas bancarias.`
        : "No se pudo detectar un formato de extracto bancario soportado.",
  };
}