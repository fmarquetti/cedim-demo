import { supabase } from "../lib/supabaseClient";

export async function emitArcaInvoice(payload) {
  const { data, error } = await supabase.functions.invoke("arca-emit-invoice", {
    body: payload,
  });

  if (error) {
    console.error("Edge Function error completo:", error);

    let detail = error.message || "La Edge Function devolvió un error.";

    try {
      const context = error.context;

      if (context && typeof context.json === "function") {
        const json = await context.json();
        console.error("Respuesta JSON Edge Function:", json);
        detail = json?.error || JSON.stringify(json);
      } else if (context && typeof context.text === "function") {
        const text = await context.text();
        console.error("Respuesta texto Edge Function:", text);
        detail = text || detail;
      }
    } catch (readError) {
      console.error("No se pudo leer el cuerpo del error:", readError);
    }

    throw new Error(detail);
  }

  if (!data?.ok) {
    console.error("Respuesta no OK:", data);
    throw new Error(data?.error || "ARCA rechazó la factura.");
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