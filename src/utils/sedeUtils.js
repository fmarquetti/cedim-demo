export const TODAS_LAS_SEDES_ID = "todas";
export const TODAS_LAS_SEDES = { id: TODAS_LAS_SEDES_ID, nombre: "Todas las sedes" };

export function userHasAllSedesAccess(user) {
  return Boolean(
    user?.allSedesAccess ||
      user?.acceso_todas_sedes ||
      user?.accesoTodasSedes ||
      user?.accessScope === "all"
  );
}

export function isTodasLasSedes(value) {
  if (!value) return true;
  if (value === TODAS_LAS_SEDES_ID || value === TODAS_LAS_SEDES.nombre) return true;
  if (typeof value === "object") {
    const id = value.id || value.sedeId;
    return !id || id === TODAS_LAS_SEDES_ID || value.nombre === TODAS_LAS_SEDES.nombre;
  }
  return false;
}

export function normalizeSelectedSede(value) {
  if (isTodasLasSedes(value)) return { ...TODAS_LAS_SEDES };

  if (typeof value === "object") {
    return {
      id: value.id || value.sedeId,
      nombre: value.nombre || value.sede || value.sedeNombre || "Sede",
    };
  }

  return { id: value, nombre: "Sede" };
}

export function getSedeId(value) {
  return normalizeSelectedSede(value).id;
}

export function getDbSedeId(value) {
  if (isTodasLasSedes(value)) return null;
  if (typeof value === "object") return value.id || value.sedeId || null;
  return value || null;
}

export function getUserDefaultSede(user) {
  if (user?.sede && typeof user.sede === "object") {
    return normalizeSelectedSede(user.sede);
  }

  if (user?.sedeId) {
    return {
      id: user.sedeId,
      nombre: user.sedeNombre || user.sede || "Sede asignada",
    };
  }

  return TODAS_LAS_SEDES;
}

export function resolveEffectiveSede(currentUser, selectedSede) {
  if (userHasAllSedesAccess(currentUser)) {
    return normalizeSelectedSede(selectedSede);
  }

  return getUserDefaultSede(currentUser);
}
