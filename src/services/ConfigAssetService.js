import { supabase } from "../lib/supabaseClient";

const CONFIG_BUCKET = "config-assets";

function sanitizeFileName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

export async function uploadConfigIcon(file, folder = "general") {
  if (!file) {
    throw new Error("No se seleccionó ningún archivo.");
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Formato no permitido. Usá PNG, JPG, WEBP o SVG.");
  }

  const maxSizeMb = 2;
  const maxSizeBytes = maxSizeMb * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    throw new Error(`El archivo no puede superar los ${maxSizeMb}MB.`);
  }

  const extension = file.name.split(".").pop() || "png";
  const cleanName = sanitizeFileName(file.name.replace(`.${extension}`, ""));
  const timestamp = Date.now();

  const filePath = `${folder}/${cleanName}-${timestamp}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(CONFIG_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    console.error("Error subiendo icono:", uploadError);
    throw new Error("No se pudo subir el icono.");
  }

  const { data } = supabase.storage
    .from(CONFIG_BUCKET)
    .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error("No se pudo obtener la URL pública del icono.");
  }

  return {
    path: filePath,
    publicUrl: data.publicUrl,
  };
}