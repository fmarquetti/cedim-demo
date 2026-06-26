import { supabase } from "../lib/supabaseClient";
import { getPermissionsForRole } from "../utils/permissions";

function normalizeUser(dbUser) {
    const accesoTodasSedes = Boolean(dbUser.acceso_todas_sedes);
    const sedeAsignada = dbUser.usuario_sedes?.[0]?.sedes || null;

    if (!accesoTodasSedes && !sedeAsignada?.id) {
        throw new Error("El usuario no tiene una sede asignada. Contactá a un administrador.");
    }

    return {
        id: dbUser.id,
        authUserId: dbUser.auth_user_id,
        name: dbUser.nombre,
        nombre: dbUser.nombre,
        email: dbUser.email,
        role: dbUser.rol,
        rol: dbUser.rol,
        access: accesoTodasSedes ? "Todas las sedes" : "Una sede",
        acceso: accesoTodasSedes ? "Todas las sedes" : "Una sede",
        sede: accesoTodasSedes
            ? "Todas las sedes"
            : sedeAsignada.nombre,
        sedeNombre: accesoTodasSedes ? "Todas las sedes" : sedeAsignada.nombre,
        sedeId: sedeAsignada?.id || null,
        permissions: getPermissionsForRole(dbUser.rol, dbUser.permisos || []),
        permisos: getPermissionsForRole(dbUser.rol, dbUser.permisos || []),
        developmentDisabledPages: dbUser.development_disabled_pages || [],
        development_disabled_pages: dbUser.development_disabled_pages || [],
        estado: dbUser.estado,
    };
}

export async function loginWithEmail(email, password) {
    const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
            email,
            password,
        });

    await supabase.rpc("link_current_user_profile");

    if (authError) {
        throw new Error("Usuario o contraseña incorrectos.");
    }

    const { data: userData, error: userError } = await supabase
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
        .eq("auth_user_id", authData.user.id)
        .single();

    if (userError || !userData) {
        await supabase.auth.signOut();
        throw new Error("El usuario no está autorizado para ingresar.");
    }

    if (userData.estado !== "Activo") {
        await supabase.auth.signOut();
        throw new Error("El usuario se encuentra suspendido.");
    }

    return normalizeUser(userData);
}

export async function logout() {
    await supabase.auth.signOut();
}

export async function getCurrentUserProfile() {
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session?.user) return null;

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
        .eq("auth_user_id", sessionData.session.user.id)
        .single();

    if (error || !data || data.estado !== "Activo") return null;

    return normalizeUser(data);
}
