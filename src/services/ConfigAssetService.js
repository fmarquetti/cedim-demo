import { supabase } from "../lib/supabaseClient";

const BUCKET = "genetics-config";

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

function validarImagen(file) {
  if (!file) {
    throw new Error("No se seleccionó ningún archivo.");
  }

  const tiposPermitidos = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];

  if (!tiposPermitidos.includes(file.type)) {
    throw new Error("El archivo debe ser una imagen PNG, JPG, WEBP o SVG.");
  }

  const maxSize = 1024 * 1024 * 2;

  if (file.size > maxSize) {
    throw new Error("El icono no puede superar los 2 MB.");
  }
}

export async function uploadConfigIcon(file, carpeta = "icons") {
  validarImagen(file);

  const timestamp = Date.now();
  const safeName = limpiarNombreArchivo(file.name);
  const path = `${carpeta}/${timestamp}_${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });

  if (error) {
    console.error("Error subiendo icono:", error);
    throw new Error("No se pudo subir el icono.");
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return {
    path,
    publicUrl: data.publicUrl,
  };
}