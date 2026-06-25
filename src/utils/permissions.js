export const PERMISSION_ACTIONS = [
  { id: "view", label: "Ver" },
  { id: "create", label: "Crear" },
  { id: "edit", label: "Editar" },
  { id: "delete", label: "Eliminar" },
];

export const PERMISSION_MODULES = [
  {
    group: "Principal",
    modules: [{ id: "dashboard", label: "Dashboard", actions: ["view"] }],
  },
  {
    group: "Gestion contable",
    modules: [
      { id: "ingresos", label: "Ingresos" },
      { id: "egresos", label: "Egresos" },
      { id: "ordenesPago", label: "Ordenes de Pago" },
      { id: "cuentas", label: "Cuentas corrientes", actions: ["view", "edit"] },
      {
        id: "cuentasCorrientesEntidades",
        label: "CC Clientes/Proveedores",
        actions: ["view", "edit"],
      },
      { id: "bancos", label: "Bancos" },
      { id: "reportes", label: "Reportes", actions: ["view"] },
    ],
  },
  {
    group: "Contabilidad fiscal",
    modules: [
      { id: "panelContador", label: "Panel del Contador", actions: ["view"] },
      { id: "contabilidad", label: "Contabilidad", actions: ["view", "edit"] },
      { id: "asientosManuales", label: "Asientos Manuales" },
      { id: "saldosIniciales", label: "Saldos Iniciales" },
      { id: "periodosContables", label: "Periodos Contables" },
      { id: "cierreEjercicio", label: "Cierre de Ejercicio", actions: ["view", "edit"] },
      { id: "auditoriaContable", label: "Auditoria Contable", actions: ["view", "edit"] },
      { id: "historialAuditoria", label: "Historial de Auditoria", actions: ["view"] },
      { id: "importaciones", label: "Importaciones", actions: ["view", "create"] },
      { id: "iva", label: "IVA", actions: ["view"] },
      { id: "configuracionFiscal", label: "Configuracion Fiscal", actions: ["view", "edit"] },
      { id: "documentos", label: "Documentos" },
      { id: "facturacion", label: "Facturacion" },
    ],
  },
  {
    group: "Operacion medica",
    modules: [
      { id: "pacientes", label: "Pacientes y estudios" },
      { id: "turnos", label: "Turnos" },
    ],
  },
  {
    group: "Administracion",
    modules: [
      { id: "sedes", label: "Sociedades / Sedes" },
      { id: "usuarios", label: "Usuarios" },
      { id: "tickets", label: "Tickets", actions: ["view", "create", "edit"] },
      { id: "configuracion", label: "Configuracion", actions: ["view", "edit"] },
    ],
  },
];

export const PAGE_IDS = PERMISSION_MODULES.flatMap((group) =>
  group.modules.map((module) => module.id)
);

export function getUserPermissions(user) {
  if (!user) return [];

  const rawPermissions = Array.isArray(user.permissions)
    ? user.permissions
    : Array.isArray(user.permisos)
      ? user.permisos
      : [];

  if (user.role === "Administrador" || user.rol === "Administrador") {
    return rawPermissions.includes("all") ? rawPermissions : ["all", ...rawPermissions];
  }

  return rawPermissions;
}

export function hasPermission(user, permission) {
  const permissions = getUserPermissions(user);

  if (permissions.includes("all")) return true;
  if (!permission) return false;

  return permissions.includes(permission);
}

export function canViewPage(user, pageId) {
  if (!pageId) return false;
  if (pageId === "tickets") return Boolean(user);

  return (
    hasPermission(user, `${pageId}.view`) ||
    hasPermission(user, pageId)
  );
}

export function canPerform(user, pageId, action) {
  if (action === "view") return canViewPage(user, pageId);

  return hasPermission(user, `${pageId}.${action}`);
}

export function getFirstPermittedPage(user, pageIds = PAGE_IDS) {
  return pageIds.find((pageId) => canViewPage(user, pageId)) || null;
}

export function getPermissionsForRole(role, selectedPermissions = []) {
  if (role === "Administrador") return ["all"];

  return selectedPermissions.filter((permission) => permission !== "all");
}

export function getModuleActions(module) {
  return module.actions || PERMISSION_ACTIONS.map((action) => action.id);
}
