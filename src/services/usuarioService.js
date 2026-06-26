import { supabase } from "../lib/supabaseClient";
import { getPermissionsForRole } from "../utils/permissions";

function mapUsuario(row) {
    const sedesAsignadas = row.usuario_sedes || [];
    const accesoTodasSedes = Boolean(row.acceso_todas_sedes);
    const sedeAsignada = sedesAsignadas[0]?.sedes || null;

    return {
        id: row.id,
        authUserId: row.auth_user_id,
        nombre: row.nombre,
        email: row.email,
        rol: row.rol,
        allSedesAccess: accesoTodasSedes,
        acceso_todas_sedes: accesoTodasSedes,
        accessScope: accesoTodasSedes ? "all" : "single",
        access: accesoTodasSedes ? "Todas las sedes" : "Una sede",
        acceso: accesoTodasSedes ? "Todas las sedes" : "Una sede",
        sede: accesoTodasSedes
            ? "Todas las sedes"
            : sedeAsignada?.nombre || "Sin sede",
        sedeNombre: accesoTodasSedes ? "Todas las sedes" : sedeAsignada?.nombre || "Sin sede",
        sedeId: sedeAsignada?.id || "",
        estado: row.estado,
        permisos: getPermissionsForRole(row.rol, row.permisos || []),
        permissions: getPermissionsForRole(row.rol, row.permisos || []),
        developmentDisabledPages: row.development_disabled_pages || [],
        development_disabled_pages: row.development_disabled_pages || [],
    };
}

export async function getUsuarios() {
    const { data, error } = await supabase
        .from("usuarios")
        .select(`
      *,
      usuario_sedes (
        sede_id,
        sedes (
          id,
          nombre
        )
      )
    `)
        .order("created_at", { ascending: false });

    if (error) throw error;

    return data.map(mapUsuario);
}

export async function createUsuario(form) {
  const { data, error } = await supabase.functions.invoke("create-user", {
    body: {
      ...form,
      development_disabled_pages: form.developmentDisabledPages || [],
    },
  });

  if (error) {
    console.error("Error Edge Function completo:", error);

    if (error.context) {
      const text = await error.context.text();
      console.error("Respuesta real de la Edge Function:", text);

      try {
        const json = JSON.parse(text);
        throw new Error(json.error || "No se pudo crear el usuario.");
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          throw new Error(text || "No se pudo crear el usuario.", { cause: parseError });
        }

        throw parseError;
      }
    }

    throw new Error(error.message || "No se pudo crear el usuario.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data.usuario;
}

export async function toggleUsuarioEstado(usuario) {
    const nuevoEstado = usuario.estado === "Activo" ? "Suspendido" : "Activo";

    const { error } = await supabase
        .from("usuarios")
        .update({ estado: nuevoEstado })
        .eq("id", usuario.id);

    if (error) throw error;
}

export async function updateUsuario(id, payload) {
    const updatePayload = { ...payload };

    if ("permisos" in updatePayload || "rol" in updatePayload) {
        updatePayload.permisos = getPermissionsForRole(
            updatePayload.rol,
            updatePayload.permisos || []
        );
    }

    const { error } = await supabase
        .from("usuarios")
        .update(updatePayload)
        .eq("id", id);

    if (error) throw error;
}

export async function updateUsuarioPermisos(id, permisos, rol) {
    const { error } = await supabase
        .from("usuarios")
        .update({ permisos: getPermissionsForRole(rol, permisos) })
        .eq("id", id);

    if (error) throw error;
}

export async function updateUsuarioDevelopmentDisabledPages(id, pages) {
    const { error } = await supabase
        .from("usuarios")
        .update({ development_disabled_pages: pages })
        .eq("id", id);

    if (error) throw error;
}

export async function deleteUsuario(id) {
    const { error } = await supabase
        .from("usuarios")
        .delete()
        .eq("id", id);

    if (error) throw error;
}
