export function canAccessInternalTools(currentUser) {
  const email = String(currentUser?.email || "").toLowerCase();
  const role = String(
    currentUser?.rol ||
      currentUser?.role ||
      currentUser?.perfil ||
      "",
  ).toLowerCase();

  return (
    ["francomarquetti@gmail.com"].includes(email) ||
    role.includes("admin") ||
    role.includes("administrador")
  );
}
