import { supabase } from "../lib/supabaseClient";

function mapSede(row) {
  return {
    id: row.id,
    sede: row.nombre,
    nombre: row.nombre,
    sociedad: row.nombre_fantasia,
    nombreFantasia: row.nombre_fantasia,
    razonSocial: row.razon_social || "",
    cuit: row.cuit,
    ubicacion: row.ubicacion || "",
    responsable: row.responsable || "",
    direccion: row.direccion || "",
    usuarios: row.usuarios_count || 0,
    estudiosMes: row.estudios_mes || 0,
    estado: row.estado,
  };
}

export async function getSedes() {
  const { data, error } = await supabase
    .from("sedes")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) throw error;

  return data.map(mapSede);
}

export async function createSede(form) {
  const { data, error } = await supabase
    .from("sedes")
    .insert({
      nombre: form.sede.trim(),
      nombre_fantasia: form.sociedad.trim(),
      razon_social: form.razonSocial?.trim() || null,
      cuit: form.cuit.trim(),
      ubicacion: form.ubicacion?.trim() || null,
      direccion: form.direccion?.trim() || null,
      responsable: form.responsable?.trim() || null,
      estado: "Activa",
    })
    .select()
    .single();

  if (error) throw error;

  return mapSede(data);
}

export async function updateSede(id, form) {
  const { data, error } = await supabase
    .from("sedes")
    .update({
      nombre: form.sede.trim(),
      nombre_fantasia: form.sociedad.trim(),
      razon_social: form.razonSocial?.trim() || null,
      cuit: form.cuit.trim(),
      ubicacion: form.ubicacion?.trim() || null,
      direccion: form.direccion?.trim() || null,
      responsable: form.responsable?.trim() || null,
      estado: form.estado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return mapSede(data);
}

export async function toggleSedeEstado(sede) {
  const nuevoEstado = sede.estado === "Activa" ? "Inactiva" : "Activa";

  const { error } = await supabase
    .from("sedes")
    .update({
      estado: nuevoEstado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sede.id);

  if (error) throw error;
}

export async function deleteSede(id) {
  const { error } = await supabase.from("sedes").delete().eq("id", id);

  if (error) throw error;
}
