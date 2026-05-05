import { supabase } from "../lib/supabaseClient";

const BUCKET = "genetics-archivos";

function limpiarNombreArchivo(nombre) {
  const extension = nombre.includes(".") ? nombre.split(".").pop() : "";
  const base = nombre.replace(/\.[^/.]+$/, "");

  const limpio = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);

  return extension ? `${limpio}.${extension}` : limpio;
}

export async function uploadArchivo(file, carpeta = "documentos") {
  if (!file) return null;

  const timestamp = Date.now();
  const safeName = limpiarNombreArchivo(file.name);
  const path = `${carpeta}/${timestamp}_${safeName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) throw error;

  return {
    path: data.path,
    nombre: file.name,
    tipo: file.type || "",
    size: file.size || 0,
  };
}

export async function getSignedArchivoUrl(path, expiresIn = 60 * 10) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;

  return data.signedUrl;
}

export async function deleteArchivo(path) {
  if (!path) return;

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path]);

  if (error) throw error;
}