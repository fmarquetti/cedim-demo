import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

/* global process */

const baseUrl = process.env.PROPOSAL_CAPTURE_URL || "http://localhost:5173";
const email = process.env.PROPOSAL_CAPTURE_EMAIL || "user@mail.com";
const password = process.env.PROPOSAL_CAPTURE_PASSWORD || "";
const outputDir = process.env.PROPOSAL_CAPTURE_OUTPUT || "public/proposal-screenshots";

const pages = [
  { key: "dashboard", label: "Dashboard" },
  { key: "ingresos", label: "Ingresos" },
  { key: "egresos", label: "Egresos" },
  { key: "bancos", label: "Bancos" },
  { key: "ordenesPago", label: /Ordenes de Pago|Órdenes de Pago/i },
  { key: "facturacion", label: /Facturacion|Facturación/i },
  { key: "iva", label: "IVA" },
  { key: "contabilidad", label: "Contabilidad" },
  { key: "panelContador", label: /Panel del Contador/i },
  { key: "periodosContables", label: /Periodos Contables|Períodos Contables/i },
  { key: "auditoriaContable", label: /Auditoria Contable|Auditoría Contable/i },
  { key: "asientosManuales", label: /Asientos Manuales/i },
  { key: "saldosIniciales", label: /Saldos Iniciales/i },
  { key: "cuentasCorrientesEntidades", label: /CC Clientes\/Proveedores|Clientes\/Proveedores/i },
  { key: "importaciones", label: "Importaciones" },
  { key: "historialAuditoria", label: /Historial de Auditoria|Historial de Auditoría/i },
  { key: "configuracionFiscal", label: /Configuracion Fiscal|Configuración Fiscal/i },
  { key: "cierreEjercicio", label: /Cierre de Ejercicio/i },
];

async function clickByText(page, label) {
  const locator = page.getByRole("button", { name: label }).first();
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.click();
}

async function login(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[autocomplete="email"]').first().fill(email);
  await page.locator('input[type="password"], input[autocomplete="current-password"]').first().fill(password);
  await page.getByRole("button", { name: /Ingresar|Login|Iniciar/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1800);
}

async function ensureSidebarReady(page) {
  const toggle = page.locator(".sidebar-toggle").first();
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function capturePage(page, item, screenshots) {
  try {
    await clickByText(page, item.label);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
    const filename = `${item.key}.png`;
    await page.screenshot({
      path: path.join(outputDir, filename),
      fullPage: true,
      animations: "disabled",
    });
    screenshots[item.key] = `/proposal-screenshots/${filename}`;
    console.log(`Captured ${item.key}`);
  } catch (error) {
    screenshots[item.key] = "missing";
    console.error(`Missing ${item.key}: ${error.message}`);
  }
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const screenshots = {};

  try {
    await login(page);
    await ensureSidebarReady(page);

    for (const item of pages) {
      await capturePage(page, item, screenshots);
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    screenshots,
  };
  await fs.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Manifest written to ${path.join(outputDir, "manifest.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
