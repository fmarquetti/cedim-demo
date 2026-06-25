import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const defaultOperatorPermissions = [
  "dashboard.view",
  "ingresos.view",
  "ingresos.create",
  "ingresos.edit",
  "egresos.view",
  "pacientes.view",
  "pacientes.create",
  "turnos.view",
  "turnos.create",
];

function getInitialPermissions(rol: string, requestedPermissions: unknown) {
  if (rol === "Administrador") return ["all"];

  if (Array.isArray(requestedPermissions) && requestedPermissions.length > 0) {
    return requestedPermissions
      .filter((permiso) => typeof permiso === "string")
      .filter((permiso) => permiso !== "all");
  }

  if (rol === "Operador") return defaultOperatorPermissions;

  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl =
      Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");

    const anonKey =
      Deno.env.get("ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error: "Faltan variables de entorno en la función.",
          envCheck: {
            PROJECT_URL: !!Deno.env.get("PROJECT_URL"),
            ANON_KEY: !!Deno.env.get("ANON_KEY"),
            SERVICE_ROLE_KEY: !!Deno.env.get("SERVICE_ROLE_KEY"),
            SUPABASE_URL: !!Deno.env.get("SUPABASE_URL"),
            SUPABASE_ANON_KEY: !!Deno.env.get("SUPABASE_ANON_KEY"),
            SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get(
              "SUPABASE_SERVICE_ROLE_KEY"
            ),
          },
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: currentAuthUser },
      error: currentUserError,
    } = await supabaseUser.auth.getUser();

    if (currentUserError || !currentAuthUser) {
      return new Response(JSON.stringify({ error: "Sesión inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: currentProfile, error: profileError } = await supabaseAdmin
      .from("usuarios")
      .select("id, rol, estado, permisos")
      .eq("auth_user_id", currentAuthUser.id)
      .single();

    const currentPermissions = Array.isArray(currentProfile?.permisos)
      ? currentProfile.permisos
      : [];
    const canCreateUsers =
      currentProfile?.rol === "Administrador" ||
      currentPermissions.includes("all") ||
      currentPermissions.includes("usuarios.create") ||
      currentPermissions.includes("usuarios");

    if (
      profileError ||
      !currentProfile ||
      currentProfile.estado !== "Activo" ||
      !canCreateUsers
    ) {
      return new Response(
        JSON.stringify({
          error: "No tenes permisos para crear usuarios.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();

    const nombre = String(body.nombre || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const rol = body.rol || "Operador";
    const accesoTodasSedes = body.acceso === "Todas las sedes";
    const sedeId = body.sedeId || null;
    const permisos = getInitialPermissions(rol, body.permisos);
    const developmentDisabledPages = Array.isArray(body.development_disabled_pages)
      ? body.development_disabled_pages.filter((page) => typeof page === "string")
      : Array.isArray(body.developmentDisabledPages)
        ? body.developmentDisabledPages.filter((page) => typeof page === "string")
        : [];

    if (!nombre || !email || !rol) {
      return new Response(
        JSON.stringify({ error: "Faltan datos obligatorios." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!accesoTodasSedes && !sedeId) {
      return new Response(
        JSON.stringify({ error: "Debe seleccionar una sede." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: invitedData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: "http://localhost:5173/CEDIM-demo/set-password",
        data: {
          nombre,
          rol,
        },
      });

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserId = invitedData.user?.id;

    if (!authUserId) {
      return new Response(
        JSON.stringify({ error: "No se pudo crear el usuario en Auth." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .upsert(
        {
          auth_user_id: authUserId,
          nombre,
          email,
          rol,
          acceso_todas_sedes: accesoTodasSedes,
          estado: "Activo",
          permisos,
          development_disabled_pages: developmentDisabledPages,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      )
      .select()
      .single();

    if (usuarioError) {
      return new Response(JSON.stringify({ error: usuarioError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: deleteSedesError } = await supabaseAdmin
      .from("usuario_sedes")
      .delete()
      .eq("usuario_id", usuario.id);

    if (deleteSedesError) {
      return new Response(JSON.stringify({ error: deleteSedesError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!accesoTodasSedes) {
      const { error: sedeError } = await supabaseAdmin
        .from("usuario_sedes")
        .insert({
          usuario_id: usuario.id,
          sede_id: sedeId,
        });

      if (sedeError) {
        return new Response(JSON.stringify({ error: sedeError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        usuario,
        message: "Usuario creado e invitación enviada.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error interno.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
