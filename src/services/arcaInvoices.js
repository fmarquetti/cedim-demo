import { supabase } from "../lib/supabaseClient";

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
  const puntoVenta = String(invoice.punto_venta || 0).padStart(4, "0");
  const numero = String(invoice.numero_comprobante || 0).padStart(8, "0");
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = `factura-${puntoVenta}-${numero}.pdf`;
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

export async function listArcaInvoices() {
  const { data, error } = await supabase
    .from("arca_invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return data || [];
}
