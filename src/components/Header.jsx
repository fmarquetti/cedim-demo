import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { getSedes } from "../services/sedeService";
import {
  getUserDefaultSede,
  normalizeSelectedSede,
  TODAS_LAS_SEDES,
  userHasAllSedesAccess,
} from "../utils/sedeUtils";

export default function Header({
  selectedSede,
  setSelectedSede,
  currentUser,
  onLogout,
}) {
  const [sedes, setSedes] = useState([]);
  const [sedesLoading, setSedesLoading] = useState(false);
  const [sedesError, setSedesError] = useState("");
  const canSelectSede = userHasAllSedesAccess(currentUser);

  useEffect(() => {
    let cancelled = false;

    async function loadSedes() {
      setSedesLoading(true);
      setSedesError("");
      try {
        const data = await getSedes();
        if (cancelled) return;
        setSedes((data || []).filter((sede) => sede.estado === "Activa"));
      } catch (error) {
        console.error("Error cargando sedes en Header:", error);
        if (!cancelled) {
          setSedes([]);
          setSedesError("No se pudieron cargar las sedes");
        }
      } finally {
        if (!cancelled) setSedesLoading(false);
      }
    }

    if (canSelectSede) {
      loadSedes();
    } else {
      queueMicrotask(() => {
        setSedes([]);
        setSedesLoading(false);
        setSedesError("");
      });
    }

    return () => {
      cancelled = true;
    };
  }, [canSelectSede]);

  useEffect(() => {
    if (!canSelectSede) {
      const defaultSede = getUserDefaultSede(currentUser);
      if (normalizeSelectedSede(selectedSede).id !== defaultSede.id) {
        queueMicrotask(() => setSelectedSede(defaultSede));
      }
      return;
    }

    const normalized = normalizeSelectedSede(selectedSede);
    if (normalized.id === "todas") return;
    if (!sedes.length) return;

    const sedeActiva = sedes.some((sede) => sede.id === normalized.id);
    if (!sedeActiva) {
      queueMicrotask(() => setSelectedSede(TODAS_LAS_SEDES));
    }
  }, [canSelectSede, currentUser, selectedSede, sedes, setSelectedSede]);

  function handleChangeSede(e) {
    const valor = e.target.value;
    if (valor === "todas") {
      setSelectedSede(TODAS_LAS_SEDES);
    } else {
      const sede = sedes.find((s) => s.id === valor);
      if (sede) setSelectedSede({ id: sede.id, nombre: sede.nombre });
    }
  }

  const selectedSedeNormalizada = normalizeSelectedSede(selectedSede);
  const valorActual = selectedSedeNormalizada.id;

  return (
    <header className="topbar">
      {/*<div>
        <h1>Panel de gestión</h1>
        <p>Gestión operativa integrada</p>
      </div>*/}

      <div className="topbar-actions">
        {canSelectSede ? (
          <select
            value={valorActual}
            onChange={handleChangeSede}
            disabled={sedesLoading || Boolean(sedesError) || sedes.length === 0}
            title={sedesError || (sedes.length === 0 ? "No hay sedes activas" : "Seleccionar sede")}
            data-tour="dashboard-sede-selector"
          >
            <option value="todas">
              {sedesLoading
                ? "Cargando sedes..."
                : sedesError || (sedes.length === 0 ? "Sin sedes activas" : "Todas las sedes")}
            </option>
            {sedes.map((sede) => (
              <option key={sede.id} value={sede.id}>
                {sede.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="sede-indicator"
            title="Sede asignada por tu rol"
            data-tour="dashboard-sede-selector"
          >
            Vista: {currentUser.sede}
          </span>
        )}

        <button
          className="secondary-button"
          onClick={onLogout}
          title="Cerrar sesión"
        >
          <LogOut size={16} />
          <span>Salir</span>
        </button>
      </div>
    </header>
  );
}
