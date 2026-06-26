import { useEffect, useState } from "react";
import { Bell, Search, LogOut } from "lucide-react";
import { getSedes } from "../services/sedeService";
import { normalizeSelectedSede, TODAS_LAS_SEDES } from "../utils/sedeUtils";

export default function Header({
  selectedSede,
  setSelectedSede,
  currentUser,
  onLogout,
}) {
  const [sedes, setSedes] = useState([]);
  const isAdmin = currentUser?.access === "Todas las sedes";

  useEffect(() => {
    let cancelled = false;

    async function loadSedes() {
      try {
        const data = await getSedes();
        if (cancelled) return;
        setSedes((data || []).filter((sede) => sede.estado === "Activa"));
      } catch (error) {
        console.error("Error cargando sedes en Header:", error);
        if (!cancelled) setSedes([]);
      }
    }

    if (isAdmin) {
      loadSedes();
    }

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const normalized = normalizeSelectedSede(selectedSede);
    if (normalized.id === "todas") return;
    if (!sedes.length) return;

    const sedeActiva = sedes.some((sede) => sede.id === normalized.id);
    if (!sedeActiva) {
      setSelectedSede(TODAS_LAS_SEDES);
    }
  }, [isAdmin, selectedSede, sedes, setSelectedSede]);

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
        <div className="search-box">
          <Search size={16} />
          <input placeholder="Buscar..." data-tour="global-search" />
        </div>

        {isAdmin ? (
          <select value={valorActual} onChange={handleChangeSede} data-tour="dashboard-sede-selector">
            <option value="todas">Todas las sedes</option>
            {sedes.map((sede) => (
              <option key={sede.id} value={sede.id}>
                {sede.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span className="sede-indicator" data-tour="dashboard-sede-selector">Vista: {currentUser.sede}</span>
        )}

        <button className="icon-button">
          <Bell size={18} />
        </button>

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
