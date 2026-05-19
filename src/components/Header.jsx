import { useEffect, useState } from "react";
import { Bell, Search, LogOut } from "lucide-react";
import { getSedes } from "../services/sedeService";

export default function Header({
  selectedSede,
  setSelectedSede,
  currentUser,
  onLogout,
}) {
  const [sedes, setSedes] = useState([]);
  const isAdmin = currentUser?.access === "Todas las sedes";

  useEffect(() => {
    async function loadSedes() {
      try {
        const data = await getSedes();
        setSedes(data.filter((sede) => sede.estado === "Activa"));
      } catch (error) {
        console.error("Error cargando sedes en Header:", error);
      }
    }

    if (isAdmin) {
      loadSedes();
    }
  }, [isAdmin]);

  function handleChangeSede(e) {
    const valor = e.target.value;
    console.log("valor seleccionado:", valor);
    console.log("sedes disponibles:", sedes);
    if (valor === "todas") {
      setSelectedSede({ id: "todas", nombre: "Todas las sedes" });
    } else {
      const sede = sedes.find((s) => s.id === valor);
      console.log("sede encontrada:", sede);
      if (sede) setSelectedSede({ id: sede.id, nombre: sede.nombre });
    }
  }
  // selectedSede puede ser objeto { id, nombre } o string legacy
  const valorActual = typeof selectedSede === "object" && selectedSede !== null
    ? selectedSede.id
    : "todas";

  return (
    <header className="topbar">
      {/*<div>
        <h1>Panel de gestión</h1>
        <p>Gestión operativa integrada</p>
      </div>*/}

      <div className="topbar-actions" data-tour="reportes-sede">
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
