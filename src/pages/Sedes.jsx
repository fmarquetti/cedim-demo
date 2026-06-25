import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Eye, Power, Pencil } from "lucide-react";
import Modal from "../components/Modal";
import {
  createSede,
  deleteSede,
  getSedes,
  toggleSedeEstado,
  updateSede,
} from "../services/sedeService";
import { canPerform } from "../utils/permissions";

function filterBySede(items, selectedSede) {
  if (!selectedSede || selectedSede === "Todas las sedes") return items;

  return items.filter((item) => item.sede === selectedSede);
}

const emptyForm = {
  sede: "",
  sociedad: "",
  razonSocial: "",
  cuit: "",
  ubicacion: "",
  direccion: "",
  responsable: "",
  estado: "Activa",
};

export default function Sedes({ selectedSede, currentUser }) {
  const [sedes, setSedes] = useState([]);
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [modal, setModal] = useState(null);
  const [selectedSedeDetalle, setSelectedSedeDetalle] = useState(null);
  const [editingSede, setEditingSede] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canCreateSedes = canPerform(currentUser, "sedes", "create");
  const canEditSedes = canPerform(currentUser, "sedes", "edit");
  const canDeleteSedes = canPerform(currentUser, "sedes", "delete");

  async function loadSedes() {
    setLoading(true);

    try {
      const data = await getSedes();
      setSedes(data);
    } catch (error) {
      console.error("Error cargando sedes:", error);
      alert(error.message || "No se pudieron cargar las sedes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitialSedes() {
      try {
        const data = await getSedes();
        setSedes(data);
      } catch (error) {
        console.error("Error cargando sedes:", error);
        alert(error.message || "No se pudieron cargar las sedes.");
      } finally {
        setLoading(false);
      }
    }

    loadInitialSedes();
  }, []);

  const sedesPorFiltro = filterBySede(sedes, selectedSede);

  const sedesFiltradas = useMemo(() => {
    return sedesPorFiltro.filter((item) => {
      const searchValue = search.toLowerCase();

      const matchSearch =
        item.sede.toLowerCase().includes(searchValue) ||
        item.sociedad.toLowerCase().includes(searchValue) ||
        item.cuit.toLowerCase().includes(searchValue) ||
        item.responsable.toLowerCase().includes(searchValue) ||
        item.ubicacion.toLowerCase().includes(searchValue);

      const matchEstado =
        estadoFiltro === "Todos" || item.estado === estadoFiltro;

      return matchSearch && matchEstado;
    });
  }, [sedesPorFiltro, search, estadoFiltro]);

  const activas = sedesPorFiltro.filter((s) => s.estado === "Activa").length;
  const inactivas = sedesPorFiltro.filter((s) => s.estado === "Inactiva").length;
  const totalUsuarios = sedesPorFiltro.reduce(
    (acc, s) => acc + Number(s.usuarios || 0),
    0
  );
  const totalEstudios = sedesPorFiltro.reduce(
    (acc, s) => acc + Number(s.estudiosMes || 0),
    0
  );

  function resetFormState() {
    setForm(emptyForm);
    setEditingSede(null);
  }

  function cerrarModal() {
    setModal(null);
    setSelectedSedeDetalle(null);
    resetFormState();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingSede ? !canEditSedes : !canCreateSedes) return;

    setSaving(true);

    try {
      if (editingSede) {
        await updateSede(editingSede.id, form);
      } else {
        await createSede(form);
      }

      await loadSedes();
      cerrarModal();
    } catch (error) {
      console.error(
        editingSede ? "Error editando sede:" : "Error creando sede:",
        error
      );
      alert(
        error.message ||
          (editingSede ? "No se pudo editar la sede." : "No se pudo crear la sede.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEstado(sede) {
    if (!canEditSedes) return;

    try {
      await toggleSedeEstado(sede);
      await loadSedes();
    } catch (error) {
      console.error("Error actualizando sede:", error);
      alert(error.message || "No se pudo actualizar la sede.");
    }
  }

  async function handleDelete(id) {
    if (!canDeleteSedes) return;

    const confirmDelete = window.confirm(
      "¿Eliminar esta sede? Esta acción no se puede deshacer."
    );

    if (!confirmDelete) return;

    try {
      await deleteSede(id);
      await loadSedes();
    } catch (error) {
      console.error("Error eliminando sede:", error);
      alert(
        error.message ||
          "No se pudo eliminar la sede. Verificá que no tenga usuarios asociados."
      );
    }
  }

  function abrirDetalle(sede) {
    setSelectedSedeDetalle(sede);
    setModal("detalle");
  }

  function abrirNuevaSede() {
    if (!canCreateSedes) return;

    resetFormState();
    setModal("nueva");
  }

  function abrirEditarSede(sede) {
    if (!canEditSedes) return;

    setEditingSede(sede);
    setForm({
      sede: sede.sede || "",
      sociedad: sede.sociedad || "",
      razonSocial: sede.razonSocial || "",
      cuit: sede.cuit || "",
      ubicacion: sede.ubicacion || "",
      direccion: sede.direccion || "",
      responsable: sede.responsable || "",
      estado: sede.estado || "Activa",
    });
    setModal("nueva");
  }

  return (
    <section className="page">
      <div className="page-header" data-tour="sedes-header">
        <div>
          <h2>Sociedades / Sedes</h2>
          <p>
            Administración de sociedades, sucursales, responsables y operación
            multisede.
          </p>
        </div>

        {canCreateSedes && (
          <button className="primary-button" onClick={abrirNuevaSede} data-tour="sedes-nueva">
            <Plus size={16} /> Nueva sede
          </button>
        )}
      </div>

      <div className="stats-grid small">
        <div className="stat-card">
          <div>
            <span>Sedes activas</span>
            <strong>{activas}</strong>
            <small>Operativas actualmente</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Sedes inactivas</span>
            <strong>{inactivas}</strong>
            <small>Sin operación activa</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Usuarios asignados</span>
            <strong>{totalUsuarios}</strong>
            <small>Total operativo</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Estudios del mes</span>
            <strong>{totalEstudios.toLocaleString("es-AR")}</strong>
            <small>Producción acumulada</small>
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <input
          placeholder="Buscar por sede, sociedad, CUIT, ubicación o responsable..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-tour="sedes-busqueda"
        />

        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
        >
          <option>Todos</option>
          <option>Activa</option>
          <option>Inactiva</option>
        </select>
      </div>

      <div className="table-card" data-tour="sedes-tabla">
        <table>
          <thead>
            <tr>
              <th>Sede</th>
              <th>Nombre fantasía</th>
              <th>CUIT</th>
              <th>Ubicación</th>
              <th>Responsable</th>
              <th>Usuarios</th>
              <th>Estado</th>
              <th data-tour="sedes-acciones">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="8">Cargando sedes...</td>
              </tr>
            )}

            {!loading &&
              sedesFiltradas.map((item, index) => (
                <tr key={item.id}>
                  <td>{item.sede}</td>
                  <td>{item.sociedad}</td>
                  <td>{item.cuit}</td>
                  <td>{item.ubicacion || "-"}</td>
                  <td>{item.responsable || "-"}</td>
                  <td>{item.usuarios}</td>
                  <td>
                    <span
                      className={`status-badge ${item.estado.toLowerCase()}`}
                    >
                      {item.estado}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions" data-tour={index === 0 ? "sedes-acciones" : undefined}>
                      <button onClick={() => abrirDetalle(item)}>
                        <Eye size={16} />
                      </button>

                      {canEditSedes && (
                        <button onClick={() => abrirEditarSede(item)}>
                          <Pencil size={16} />
                        </button>
                      )}

                      {canEditSedes && (
                        <button onClick={() => handleToggleEstado(item)}>
                          <Power size={16} />
                        </button>
                      )}

                      {canDeleteSedes && (
                        <button onClick={() => handleDelete(item.id)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

            {!loading && sedesFiltradas.length === 0 && (
              <tr>
                <td colSpan="8">No se encontraron sedes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === "nueva" && (editingSede ? canEditSedes : canCreateSedes) && (
        <Modal
          title={editingSede ? "Editar sede / sociedad" : "Nueva sede / sociedad"}
          onClose={cerrarModal}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Nombre de sede
              <input
                required
                placeholder="Ej: Sede Centro"
                value={form.sede}
                onChange={(e) => setForm({ ...form, sede: e.target.value })}
              />
            </label>

            <label>
              Nombre fantasía
              <input
                required
                placeholder="Ej: CEDIM Centro"
                value={form.sociedad}
                onChange={(e) => setForm({ ...form, sociedad: e.target.value })}
              />
            </label>

            <label>
              Razón social
              <input
                placeholder="Ej: CEDIM Salud S.A."
                value={form.razonSocial}
                onChange={(e) =>
                  setForm({ ...form, razonSocial: e.target.value })
                }
              />
            </label>

            <label>
              CUIT
              <input
                required
                placeholder="Ej: 30-71234567-8"
                value={form.cuit}
                onChange={(e) => setForm({ ...form, cuit: e.target.value })}
              />
            </label>

            <label>
              Ubicación
              <input
                placeholder="Ej: Mendoza, Ciudad"
                value={form.ubicacion}
                onChange={(e) =>
                  setForm({ ...form, ubicacion: e.target.value })
                }
              />
            </label>

            <label>
              Responsable
              <input
                placeholder="Ej: Dr. Martín López"
                value={form.responsable}
                onChange={(e) =>
                  setForm({ ...form, responsable: e.target.value })
                }
              />
            </label>

            <label className="full">
              Dirección
              <input
                placeholder="Ej: Av. San Martín 1250"
                value={form.direccion}
                onChange={(e) =>
                  setForm({ ...form, direccion: e.target.value })
                }
              />
            </label>

            {editingSede && (
              <label>
                Estado
                <select
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                >
                  <option>Activa</option>
                  <option>Inactiva</option>
                </select>
              </label>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={cerrarModal}
              >
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving
                  ? "Guardando..."
                  : editingSede
                    ? "Guardar cambios"
                    : "Crear sede"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "detalle" && selectedSedeDetalle && (
        <Modal
          title={`Detalle de ${selectedSedeDetalle.sede}`}
          onClose={cerrarModal}
        >
          <div className="detail-grid">
            <div>
              <span>Nombre fantasía</span>
              <strong>{selectedSedeDetalle.sociedad}</strong>
            </div>

            <div>
              <span>Razón social</span>
              <strong>{selectedSedeDetalle.razonSocial || "-"}</strong>
            </div>

            <div>
              <span>CUIT</span>
              <strong>{selectedSedeDetalle.cuit}</strong>
            </div>

            <div>
              <span>Ubicación</span>
              <strong>{selectedSedeDetalle.ubicacion || "-"}</strong>
            </div>

            <div>
              <span>Responsable</span>
              <strong>{selectedSedeDetalle.responsable || "-"}</strong>
            </div>

            <div>
              <span>Estado</span>
              <strong>{selectedSedeDetalle.estado}</strong>
            </div>

            <div className="full">
              <span>Dirección</span>
              <strong>{selectedSedeDetalle.direccion || "-"}</strong>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
