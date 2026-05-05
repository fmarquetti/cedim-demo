import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Eye,
  CheckCircle,
  RefreshCw,
  Upload,
  ExternalLink,
} from "lucide-react";

import Modal from "../components/Modal";
import { getSedes } from "../services/sedeService";
import {
  createPacienteEstudio,
  deletePacienteEstudio,
  getPacientesEstudios,
  updateEstadoPacienteEstudio,
} from "../services/pacienteService";
import {
  uploadArchivo,
  getSignedArchivoUrl,
  deleteArchivo,
} from "../services/storageService";

const emptyForm = {
  fecha: new Date().toISOString().split("T")[0],
  paciente: "",
  dni: "",
  obraSocial: "",
  sedeId: "",
  estudio: "",
  prioridad: "Normal",
  estado: "Muestra pendiente",
  observaciones: "",
  archivo: "",
  archivoPath: "",
  archivoTipo: "",
  archivoSize: 0,
  linkEstudio: "",
};

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseFecha(fecha) {
  if (!fecha) return new Date(0);

  if (String(fecha).includes("/")) {
    const [dd, mm, yyyy] = fecha.split("/");
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }

  return new Date(`${String(fecha).split("T")[0]}T00:00:00`);
}

function getStatusClass(text) {
  return normalizeText(text).replaceAll(" ", "-");
}

function formatFileSize(bytes) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Pacientes({ selectedSede, sedeId }) {
  const adjuntoInputRef = useRef(null);

  const [pacientes, setPacientes] = useState([]);
  const [sedes, setSedes] = useState([]);

  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [sortField, setSortField] = useState("fecha");
  const [sortDirection, setSortDirection] = useState("desc");

  const [modal, setModal] = useState(null);
  const [selectedPaciente, setSelectedPaciente] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [formFile, setFormFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  const selectedSedeName =
    typeof selectedSede === "object" && selectedSede !== null
      ? selectedSede.nombre
      : selectedSede || "Todas las sedes";

  const sedeBloqueada = sedeId && sedeId !== "todas";

  async function loadData(currentSedeId = sedeId) {
    setLoading(true);

    try {
      const idParaFiltro = currentSedeId === "todas" ? null : currentSedeId;

      const [pacientesData, sedesData] = await Promise.all([
        getPacientesEstudios(idParaFiltro),
        getSedes(),
      ]);

      setPacientes(pacientesData || []);
      setSedes(sedesData || []);

      setForm((prev) => ({
        ...prev,
        sedeId: prev.sedeId || idParaFiltro || sedesData?.[0]?.id || "",
      }));
    } catch (error) {
      console.error("Error cargando pacientes y estudios:", error);
      alert(error.message || "No se pudieron cargar los pacientes y estudios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(sedeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId]);

  const pacientesPorSede = pacientes;

  const pacientesFiltrados = useMemo(() => {
    const prioridadOrden = {
      Urgente: 1,
      Normal: 2,
    };

    const estadoOrden = {
      "Muestra pendiente": 1,
      "Muestra recibida": 2,
      "En proceso": 3,
      "Resultado emitido": 4,
    };

    const searchValue = normalizeText(search);

    const filtered = pacientesPorSede.filter((item) => {
      const matchSearch =
        !searchValue ||
        normalizeText(item.paciente).includes(searchValue) ||
        normalizeText(item.dni).includes(searchValue) ||
        normalizeText(item.estudio).includes(searchValue) ||
        normalizeText(item.obraSocial).includes(searchValue) ||
        normalizeText(item.sede).includes(searchValue) ||
        normalizeText(item.archivo).includes(searchValue) ||
        normalizeText(item.linkEstudio).includes(searchValue);

      const matchEstado = estadoFiltro === "Todos" || item.estado === estadoFiltro;

      return matchSearch && matchEstado;
    });

    return [...filtered].sort((a, b) => {
      let valueA = a[sortField];
      let valueB = b[sortField];

      if (sortField === "prioridad") {
        valueA = prioridadOrden[a.prioridad] || 99;
        valueB = prioridadOrden[b.prioridad] || 99;
      }

      if (sortField === "estado") {
        valueA = estadoOrden[a.estado] || 99;
        valueB = estadoOrden[b.estado] || 99;
      }

      if (sortField === "fecha") {
        valueA = parseFecha(a.fechaDb || a.fecha);
        valueB = parseFecha(b.fechaDb || b.fecha);
      }

      if (typeof valueA === "string") valueA = normalizeText(valueA);
      if (typeof valueB === "string") valueB = normalizeText(valueB);

      if (valueA < valueB) return sortDirection === "asc" ? -1 : 1;
      if (valueA > valueB) return sortDirection === "asc" ? 1 : -1;

      return 0;
    });
  }, [pacientesPorSede, search, estadoFiltro, sortField, sortDirection]);

  const totalOrdenes = pacientesPorSede.length;
  const enProceso = pacientesPorSede.filter((p) => p.estado === "En proceso").length;
  const emitidos = pacientesPorSede.filter((p) => p.estado === "Resultado emitido").length;
  const conAdjuntos = pacientesPorSede.filter((p) => p.archivoPath || p.linkEstudio).length;

  function openNuevo() {
    setForm({
      ...emptyForm,
      fecha: new Date().toISOString().split("T")[0],
      sedeId: sedeBloqueada ? sedeId : sedes[0]?.id || "",
    });

    setFormFile(null);
    setModal("nuevo");
  }

  function handleAdjuntoPaciente(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormFile(file);

    setForm((prev) => ({
      ...prev,
      archivo: file.name,
      archivoTipo: file.type || "",
      archivoSize: file.size || 0,
    }));

    e.target.value = "";
  }

  async function handleCreate(e) {
    e.preventDefault();

    if (!form.sedeId) {
      alert("Seleccioná una sede.");
      return;
    }

    setSaving(true);

    try {
      let uploaded = null;

      if (formFile) {
        uploaded = await uploadArchivo(formFile, "pacientes");
      }

      await createPacienteEstudio({
        ...form,
        archivo: uploaded?.nombre || form.archivo || "",
        archivoPath: uploaded?.path || form.archivoPath || "",
        archivoTipo: uploaded?.tipo || form.archivoTipo || "",
        archivoSize: uploaded?.size || form.archivoSize || 0,
      });

      await loadData(sedeId);

      setForm({
        ...emptyForm,
        fecha: new Date().toISOString().split("T")[0],
        sedeId: sedeBloqueada ? sedeId : sedes[0]?.id || "",
      });

      setFormFile(null);
      setModal(null);
    } catch (error) {
      console.error("Error guardando orden:", error);
      alert(error.message || "No se pudo guardar la orden.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(paciente) {
    const confirmed = window.confirm("¿Eliminar esta orden de estudio?");
    if (!confirmed) return;

    setDeletingId(paciente.id);

    try {
      await deletePacienteEstudio(paciente.id);

      if (paciente.archivoPath) {
        await deleteArchivo(paciente.archivoPath);
      }

      await loadData(sedeId);
    } catch (error) {
      console.error("Error eliminando orden:", error);
      alert(error.message || "No se pudo eliminar la orden.");
    } finally {
      setDeletingId(null);
    }
  }

  async function avanzarEstado(id, estadoActual) {
    const flujo = {
      "Muestra pendiente": "Muestra recibida",
      "Muestra recibida": "En proceso",
      "En proceso": "Resultado emitido",
      "Resultado emitido": "Resultado emitido",
    };

    const nuevoEstado = flujo[estadoActual] || estadoActual;

    setUpdatingId(id);

    try {
      await updateEstadoPacienteEstudio(id, nuevoEstado);
      await loadData(sedeId);
    } catch (error) {
      console.error("Error actualizando estado:", error);
      alert(error.message || "No se pudo actualizar el estado.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function abrirArchivo(paciente) {
    if (!paciente.archivoPath) {
      alert("Esta orden no tiene archivo almacenado.");
      return;
    }

    setOpeningId(paciente.id);

    try {
      const url = await getSignedArchivoUrl(paciente.archivoPath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Error abriendo archivo:", error);
      alert(error.message || "No se pudo abrir el archivo.");
    } finally {
      setOpeningId(null);
    }
  }

  function abrirDetalle(paciente) {
    setSelectedPaciente(paciente);
    setModal("detalle");
  }

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Pacientes y estudios</h2>
          <p>
            Gestión de órdenes, muestras, estudios, adjuntos y emisión de resultados.
            {selectedSedeName ? ` Vista actual: ${selectedSedeName}.` : ""}
          </p>
        </div>

        <div className="header-actions">
          <button
            className="secondary-button"
            onClick={() => loadData(sedeId)}
            disabled={loading}
          >
            <RefreshCw size={16} /> Actualizar
          </button>

          <button className="primary-button" onClick={openNuevo}>
            <Plus size={16} /> Nueva orden
          </button>
        </div>
      </div>

      <div className="stats-grid small">
        <div className="stat-card">
          <div>
            <span>Órdenes del período</span>
            <strong>{totalOrdenes}</strong>
            <small>Estudios registrados</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>En proceso</span>
            <strong>{enProceso}</strong>
            <small>Actualmente en laboratorio</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Resultados emitidos</span>
            <strong>{emitidos}</strong>
            <small>Disponibles para entrega</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Adjuntos / links</span>
            <strong>{conAdjuntos}</strong>
            <small>Órdenes con respaldo asociado</small>
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <input
          placeholder="Buscar por paciente, DNI, estudio, sede, obra social, archivo o link..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
          <option>Todos</option>
          <option>Muestra pendiente</option>
          <option>Muestra recibida</option>
          <option>En proceso</option>
          <option>Resultado emitido</option>
        </select>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>
                <button className="th-sort" onClick={() => handleSort("fecha")}>
                  Fecha {sortField === "fecha" && (sortDirection === "asc" ? "↑" : "↓")}
                </button>
              </th>

              <th>Paciente</th>
              <th>DNI</th>
              <th>Obra social</th>

              <th>
                <button className="th-sort" onClick={() => handleSort("sede")}>
                  Sede {sortField === "sede" && (sortDirection === "asc" ? "↑" : "↓")}
                </button>
              </th>

              <th>Estudio</th>

              <th>
                <button className="th-sort" onClick={() => handleSort("prioridad")}>
                  Prioridad {sortField === "prioridad" && (sortDirection === "asc" ? "↑" : "↓")}
                </button>
              </th>

              <th>
                <button className="th-sort" onClick={() => handleSort("estado")}>
                  Estado {sortField === "estado" && (sortDirection === "asc" ? "↑" : "↓")}
                </button>
              </th>

              <th>Adjunto</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="10">Cargando pacientes y estudios...</td>
              </tr>
            )}

            {!loading &&
              pacientesFiltrados.map((item) => (
                <tr key={item.id}>
                  <td>{item.fecha}</td>
                  <td>{item.paciente}</td>
                  <td>{item.dni}</td>
                  <td>{item.obraSocial}</td>
                  <td>{item.sede}</td>
                  <td>{item.estudio}</td>
                  <td>
                    <span className={`status-badge ${getStatusClass(item.prioridad)}`}>
                      {item.prioridad}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${getStatusClass(item.estado)}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td>
                    {item.archivoPath ? (
                      <button
                        className="secondary-button"
                        onClick={() => abrirArchivo(item)}
                        disabled={openingId === item.id}
                      >
                        Archivo
                      </button>
                    ) : item.linkEstudio ? (
                      <a href={item.linkEstudio} target="_blank" rel="noreferrer">
                        Link
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button onClick={() => abrirDetalle(item)} title="Ver detalle">
                        <Eye size={16} />
                      </button>

                      {item.estado !== "Resultado emitido" && (
                        <button
                          onClick={() => avanzarEstado(item.id, item.estado)}
                          disabled={updatingId === item.id}
                          title="Avanzar estado"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

            {!loading && pacientesFiltrados.length === 0 && (
              <tr>
                <td colSpan="10">No se encontraron órdenes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === "nuevo" && (
        <Modal title="Nueva orden de estudio" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              Fecha
              <input
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </label>

            <label>
              Paciente
              <input
                required
                value={form.paciente}
                onChange={(e) => setForm({ ...form, paciente: e.target.value })}
              />
            </label>

            <label>
              DNI
              <input
                required
                value={form.dni}
                onChange={(e) => setForm({ ...form, dni: e.target.value })}
              />
            </label>

            <label>
              Obra social / Prepaga
              <input
                value={form.obraSocial}
                onChange={(e) => setForm({ ...form, obraSocial: e.target.value })}
              />
            </label>

            <label>
              Sede
              <select
                value={form.sedeId}
                onChange={(e) => setForm({ ...form, sedeId: e.target.value })}
                disabled={sedeBloqueada}
                required
              >
                <option value="">Seleccionar sede</option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Prioridad
              <select
                value={form.prioridad}
                onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
              >
                <option>Normal</option>
                <option>Urgente</option>
              </select>
            </label>

            <label>
              Estado
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
              >
                <option>Muestra pendiente</option>
                <option>Muestra recibida</option>
                <option>En proceso</option>
                <option>Resultado emitido</option>
              </select>
            </label>

            <label className="full">
              Estudio solicitado
              <input
                required
                value={form.estudio}
                onChange={(e) => setForm({ ...form, estudio: e.target.value })}
              />
            </label>

            <label className="full">
              Link de estudio online
              <input
                placeholder="https://..."
                value={form.linkEstudio}
                onChange={(e) => setForm({ ...form, linkEstudio: e.target.value })}
              />
            </label>

            <div className="full">
              <input
                ref={adjuntoInputRef}
                type="file"
                accept="application/pdf,image/*"
                capture="environment"
                hidden
                onChange={handleAdjuntoPaciente}
              />

              <button
                type="button"
                className="secondary-button"
                onClick={() => adjuntoInputRef.current?.click()}
              >
                <Upload size={16} /> Adjuntar archivo o imagen
              </button>

              {form.archivo && (
                <small style={{ display: "block", marginTop: 8 }}>
                  Archivo seleccionado: {form.archivo} · {formatFileSize(form.archivoSize)}
                </small>
              )}
            </div>

            <label className="full">
              Observaciones
              <input
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Guardando..." : "Guardar orden"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "detalle" && selectedPaciente && (
        <Modal
          title={`Detalle de ${selectedPaciente.paciente}`}
          onClose={() => setModal(null)}
        >
          <div className="detail-grid">
            <div>
              <span>DNI</span>
              <strong>{selectedPaciente.dni}</strong>
            </div>

            <div>
              <span>Obra social</span>
              <strong>{selectedPaciente.obraSocial || "-"}</strong>
            </div>

            <div>
              <span>Sede</span>
              <strong>{selectedPaciente.sede}</strong>
            </div>

            <div>
              <span>Estudio</span>
              <strong>{selectedPaciente.estudio}</strong>
            </div>

            <div>
              <span>Prioridad</span>
              <strong>{selectedPaciente.prioridad}</strong>
            </div>

            <div>
              <span>Estado</span>
              <strong>{selectedPaciente.estado}</strong>
            </div>

            <div>
              <span>Archivo adjunto</span>
              <strong>{selectedPaciente.archivo || "-"}</strong>
            </div>

            <div>
              <span>Tipo archivo</span>
              <strong>{selectedPaciente.archivoTipo || "-"}</strong>
            </div>

            <div>
              <span>Tamaño</span>
              <strong>{formatFileSize(selectedPaciente.archivoSize)}</strong>
            </div>

            {selectedPaciente.archivoPath && (
              <div className="full">
                <button
                  className="secondary-button"
                  onClick={() => abrirArchivo(selectedPaciente)}
                  disabled={openingId === selectedPaciente.id}
                >
                  <ExternalLink size={16} /> Abrir archivo
                </button>
              </div>
            )}

            <div className="full">
              <span>Link de estudio</span>
              {selectedPaciente.linkEstudio ? (
                <a
                  href={selectedPaciente.linkEstudio}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} /> {selectedPaciente.linkEstudio}
                </a>
              ) : (
                <strong>-</strong>
              )}
            </div>

            <div className="full">
              <span>Observaciones</span>
              <strong>{selectedPaciente.observaciones || "Sin observaciones"}</strong>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}