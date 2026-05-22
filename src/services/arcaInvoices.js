import { supabase } from "../lib/supabaseClient";
import { registrarAsientoFacturaArca } from "./contabilidadAutomationService";
import { generarCcDesdeFacturaArca } from "./cuentaCorrienteAutomaticaService";
import { registrarAuditoria } from "./auditoriaService";

const arcaApiUrl =
  import.meta.env.VITE_ARCA_API_URL || "http://localhost:3001";

export async function emitArcaInvoice(payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Usuario no autenticado.");
  }

  const response = await fetch(`${arcaApiUrl}/api/arca/emitir`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    console.error("Respuesta no OK del servidor ARCA:", data);
    const detail =
      data?.details?.message ||
      data?.details?.error_description ||
      data?.debug?.message ||
      data?.debug?.error?.message ||
      "";
    const message = [data?.error || "ARCA rechazó la factura.", detail]
      .filter(Boolean)
      .join(" Detalle: ");

    throw new Error(message);
  }

  if (!data.invoice) {
    throw new Error("El servidor ARCA no devolvió el registro de factura.");
  }

  try {
    await registrarAsientoFacturaArca(data.invoice);
  } catch (error) {
    if (
      error.message === "El período contable correspondiente a esta fecha está cerrado." ||
      error.message === "El ejercicio contable correspondiente a esta fecha está cerrado."
    ) {
      console.error("Factura emitida, pero el ejercicio contable está cerrado y no se generó asiento.");
    } else {
      console.error("No se pudo generar el asiento contable ARCA:", error);
    }

    try {
      await generarCcDesdeFacturaArca(data.invoice);
    } catch (ccError) {
      console.error("Factura emitida, pero no se pudo generar cuenta corriente:", ccError);
    }

    await registrarAuditoria({
      modulo: "Facturación",
      accion: "emitir_factura",
      entidad: "arca_invoice",
      entidadId: data.invoice.id,
      descripcion: `Se emitió comprobante ARCA para ${data.invoice.cliente_nombre || data.invoice.cliente || "cliente"}.`,
      datosDespues: data.invoice,
      metadata: { warningContabilidad: error.message },
    });

    return {
      ...data.invoice,
      warning_contabilidad:
        error.message || "La factura se emitio, pero no se genero el asiento contable.",
    };
  }

  try {
    await generarCcDesdeFacturaArca(data.invoice);
  } catch (ccError) {
    console.error("Factura emitida, pero no se pudo generar cuenta corriente:", ccError);
  }

  await registrarAuditoria({
    modulo: "Facturación",
    accion: "emitir_factura",
    entidad: "arca_invoice",
    entidadId: data.invoice.id,
    descripcion: `Se emitió comprobante ARCA para ${data.invoice.cliente_nombre || data.invoice.cliente || "cliente"}.`,
    datosDespues: data.invoice,
  });

  return data.invoice;
}

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Usuario no autenticado.");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function getArcaInvoicePdfUrl(invoiceId) {
  const response = await fetch(
    `${arcaApiUrl}/api/arca/invoices/${invoiceId}/pdf-url`,
    {
      headers: await getAuthHeaders(),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "No se pudo obtener el PDF de la factura.");
  }

  return data.pdf_url;
}

export async function downloadArcaInvoicePdf(invoice) {
  if (!invoice?.id) {
    throw new Error("Factura invalida.");
  }

  const response = await fetch(
    `${arcaApiUrl}/api/arca/invoices/${invoice.id}/download`,
    {
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "No se pudo descargar el PDF.");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const isInternal =
    invoice.es_fiscal === false ||
    ["remito_interno", "recibo_interno"].includes(
      String(invoice.comprobante_categoria || invoice.tipo_comprobante),
    );
  const link = document.createElement("a");

  link.href = objectUrl;
  if (isInternal) {
    link.download = `${invoice.comprobante_categoria || "comprobante-interno"}-${String(
      invoice.comprobante_interno_numero || 0,
    ).padStart(8, "0")}.pdf`;
  } else {
    const puntoVenta = String(invoice.punto_venta || 0).padStart(4, "0");
    const numero = String(invoice.numero_comprobante || 0).padStart(8, "0");
    link.download = `factura-${puntoVenta}-${numero}.pdf`;
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export async function sendArcaInvoiceEmail(invoiceId, email) {
  const response = await fetch(
    `${arcaApiUrl}/api/arca/invoices/${invoiceId}/send-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getAuthHeaders()),
      },
      body: JSON.stringify({ email }),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "No se pudo enviar la factura por mail.");
  }

  await registrarAuditoria({
    modulo: "Facturación",
    accion: "enviar_factura_email",
    entidad: "arca_invoice",
    entidadId: invoiceId,
    descripcion: `Se envió comprobante ARCA por email a ${email}.`,
    datosDespues: data.invoice,
    metadata: { email },
  });

  return data.invoice;
}

export async function getArcaInvoiceEvents(invoiceId) {
  const response = await fetch(
    `${arcaApiUrl}/api/arca/invoices/${invoiceId}/events`,
    {
      headers: await getAuthHeaders(),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(
      data?.error || "No se pudo obtener la actividad de la factura.",
    );
  }

  return data.events || [];
}

export async function getArcaSettings() {
  const { data, error } = await supabase
    .from("arca_settings")
    .select("*")
    .eq("origen", "CEDIM")
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

export async function updateArcaSettings(settings) {
  const payload = {
    ...settings,
    origen: "CEDIM",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("arca_settings")
    .upsert(payload, { onConflict: "origen" })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function listArcaInvoices() {
  const { data, error } = await supabase
    .from("arca_invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return data || [];
}
