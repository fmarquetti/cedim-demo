import { supabase } from "../lib/supabaseClient";
import { getPermissionsForRole } from "../utils/permissions";

function normalizeUser(dbUser) {
    const accesoTodasSedes = Boolean(dbUser.acceso_todas_sedes);
    const sedeAsignada = dbUser.usuario_sedes?.[0]?.sedes || null;

    if (!accesoTodasSedes && !sedeAsignada?.id) {
        throw new Error("El usuario no tiene una sede asignada. Contacta a un administrador.");
    }

    return {
        id: dbUser.id,
        authUserId: dbUser.auth_user_id,
        name: dbUser.nombre,
        nombre: dbUser.nombre,
        email: dbUser.email,
        role: dbUser.rol,
        rol: dbUser.rol,
        allSedesAccess: accesoTodasSedes,
        acceso_todas_sedes: accesoTodasSedes,
        accessScope: accesoTodasSedes ? "all" : "single",
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

async function getProfileForAuthUser(authUserId, messages = {}) {
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
        .eq("auth_user_id", authUserId)
        .single();

    if (userError || !userData) {
        await supabase.auth.signOut();
        throw new Error(messages.unauthorizedMessage || "Sesion no autorizada.");
    }

    if (userData.estado !== "Activo") {
        await supabase.auth.signOut();
        throw new Error(messages.suspendedMessage || "Sesion suspendida.");
    }

    return normalizeUser(userData);
}

export async function loginWithEmail(email, password) {
    const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
            email,
            password,
        });

    if (authError || !authData?.user) {
        throw new Error("Usuario o contrasena incorrectos.");
    }

    return getProfileForAuthUser(authData.user.id, {
        unauthorizedMessage: "El usuario no esta autorizado para ingresar.",
        suspendedMessage: "El usuario se encuentra suspendido.",
    });
}

export async function logout() {
    await supabase.auth.signOut();
}

export async function getCurrentUserProfile() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
        console.error("Error leyendo sesion activa:", sessionError);
        await supabase.auth.signOut();
        return null;
    }

    if (!sessionData.session?.user) return null;

    try {
        return await getProfileForAuthUser(sessionData.session.user.id);
    } catch (error) {
        console.error("Error recuperando perfil de sesion activa:", error);
        return null;
    }
}
