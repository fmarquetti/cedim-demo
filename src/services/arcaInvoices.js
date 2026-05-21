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

export async function listArcaInvoices() {
  const { data, error } = await supabase
    .from("arca_invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return data || [];
}
