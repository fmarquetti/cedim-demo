import { supabase } from "../lib/supabaseClient";

export const defaultAppConfig = {
    platformName: "Genetics",
    platformSubtitle: "Laboratorio clínico",
    platformIconUrl: "",
    loginTitle: "GENETICS",
    loginSubtitle: "Plataforma de gestión para laboratorio clínico",
    loginIconUrl: "",
    loginFooterText: "Genetics · Versión",
    loginFooterHighlight: "SUPABASE",
    footerText: "Creado por TECNEW",
    footerEnvironment: "Demo",
    primaryColor: "#028baf",
    secondaryColor: "#3a73b9",
    accentColor: "#3eb9b1",
    hiddenMenuItems: [],
    paymentNoticeEnabled: false,
    paymentNoticeText:
        "Servicio suspendido temporalmente por falta de pago. Regularice la situación para continuar operando.",
};

function mergeWithDefaultConfig(config) {
    return {
        ...defaultAppConfig,
        ...(config || {}),
        hiddenMenuItems: Array.isArray(config?.hiddenMenuItems)
            ? config.hiddenMenuItems
            : [],
    };
}

export async function getAppConfig() {
    const { data, error } = await supabase
        .from("configuracion_app")
        .select("valor")
        .eq("clave", "app")
        .single();

    if (error) {
        console.error("Error obteniendo configuración:", error);
        return defaultAppConfig;
    }

    return mergeWithDefaultConfig(data?.valor);
}

export async function saveAppConfig(config) {
    const payload = mergeWithDefaultConfig(config);

    const { data, error } = await supabase
        .from("configuracion_app")
        .upsert(
            {
                clave: "app",
                valor: payload,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "clave" }
        )
        .select("valor")
        .single();

    if (error) {
        console.error("Error guardando configuración:", error);
        throw new Error("No se pudo guardar la configuración.");
    }

    return mergeWithDefaultConfig(data?.valor);
}