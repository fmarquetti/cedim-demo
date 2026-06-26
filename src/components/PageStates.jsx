import { AlertTriangle, Lock, Loader2, SearchX } from "lucide-react";

export function PageLoader({ title = "Cargando", message = "Estamos cargando la informacion." }) {
  return (
    <div className="page-state page-state--loading">
      <Loader2 className="page-state-icon page-state-icon--spin" size={34} />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({ title = "Sin datos", message = "No hay informacion para mostrar." }) {
  return (
    <div className="page-state page-state--empty">
      <SearchX className="page-state-icon" size={30} />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

export function ErrorState({
  title = "No se pudo cargar",
  message = "Ocurrio un error al cargar la informacion.",
  action,
}) {
  return (
    <div className="page-state page-state--error">
      <AlertTriangle className="page-state-icon" size={30} />
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function PermissionDeniedState({
  title = "No tenes permisos",
  message = "No tenes permisos para acceder a esta seccion.",
}) {
  return (
    <div className="page-state page-state--permission">
      <Lock className="page-state-icon" size={30} />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
