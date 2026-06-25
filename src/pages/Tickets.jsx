import { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  MessageSquarePlus,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Ticket,
} from "lucide-react";

import Modal from "../components/Modal";
import {
  addTicketComment,
  createTicket,
  getTickets,
  updateTicketAdmin,
} from "../services/ticketService";
import { getSignedArchivoUrl, uploadArchivo } from "../services/storageService";

const CATEGORIAS = ["Error", "Mejora", "Consulta", "Configuración"];
const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];
const ESTADOS = ["Abierto", "En proceso", "Resuelto", "Cerrado"];

const emptyForm = {
  titulo: "",
  descripcion: "",
  categoria: "Consulta",
  prioridad: "Media",
};

function isAdmin(user) {
  return user?.role === "Administrador" || user?.rol === "Administrador";
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getStatusClass(text) {
  return normalizeText(text).replace(/\s+/g, "-");
}

function resumen(text, length = 110) {
  if (!text) return "-";
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Tickets({ currentUser }) {
  const fileInputRef = useRef(null);
  const admin = isAdmin(currentUser);

  const [tickets, setTickets] = useState([]);
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [prioridadFiltro, setPrioridadFiltro] = useState("Todas");
  const [modal, setModal] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formFile, setFormFile] = useState(null);
  const [adminDraft, setAdminDraft] = useState({
    estado: "Abierto",
    prioridadInterna: "Media",
  });
  const [commentDraft, setCommentDraft] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);

    try {
      const data = await getTickets(currentUser);
      setTickets(data || []);
    } catch (error) {
      console.error("Error cargando tickets:", error);
      alert(error.message || "No se pudieron cargar los tickets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => loadData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.email, currentUser?.role]);

  useEffect(() => {
    function handleTicketsChanged() {
      loadData();
    }

    window.addEventListener("tickets:changed", handleTicketsChanged);
    return () => window.removeEventListener("tickets:changed", handleTicketsChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.email, currentUser?.role]);

  useEffect(() => {
    let active = true;

    async function loadScreenshotUrl() {
      setScreenshotUrl("");
      if (modal !== "detalle" || !selectedTicket?.screenshotPath) return;

      try {
        const url = await getSignedArchivoUrl(selectedTicket.screenshotPath);
        if (active) setScreenshotUrl(url || "");
      } catch (error) {
        console.error("Error cargando captura del ticket:", error);
        if (active) setScreenshotUrl("");
      }
    }

    loadScreenshotUrl();
    return () => {
      active = false;
    };
  }, [modal, selectedTicket?.screenshotPath]);

  const filteredTickets = useMemo(() => {
    const searchValue = normalizeText(search);

    return tickets.filter((ticket) => {
      const matchSearch =
        !searchValue ||
        normalizeText(ticket.codigo).includes(searchValue) ||
        normalizeText(ticket.titulo).includes(searchValue) ||
        normalizeText(ticket.descripcion).includes(searchValue) ||
        normalizeText(ticket.usuarioNombre).includes(searchValue);

      const matchEstado = estadoFiltro === "Todos" || ticket.estado === estadoFiltro;
      const matchPrioridad =
        prioridadFiltro === "Todas" ||
        ticket.prioridad === prioridadFiltro ||
        ticket.prioridadInterna === prioridadFiltro;

      return matchSearch && matchEstado && matchPrioridad;
    });
  }, [tickets, search, estadoFiltro, prioridadFiltro]);

  const abiertos = tickets.filter((ticket) => ticket.estado === "Abierto").length;
  const enProceso = tickets.filter((ticket) => ticket.estado === "En proceso").length;
  const urgentes = tickets.filter(
    (ticket) => ticket.prioridad === "Urgente" || ticket.prioridadInterna === "Urgente"
  ).length;
  const resueltos = tickets.filter(
    (ticket) => ticket.estado === "Resuelto" || ticket.estado === "Cerrado"
  ).length;

  function openCreateModal() {
    setForm(emptyForm);
    setFormFile(null);
    setModal("nuevo");
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    setFormFile(file || null);
    event.target.value = "";
  }

  async function handleCreate(event) {
    event.preventDefault();

    if (!form.titulo.trim() || !form.descripcion.trim()) {
      alert("Completa titulo y descripcion.");
      return;
    }

    setSaving(true);

    try {
      let uploaded = null;

      if (formFile) {
        uploaded = await uploadArchivo(formFile, "tickets");
      }

      await createTicket(
        {
          ...form,
          titulo: form.titulo.trim(),
          descripcion: form.descripcion.trim(),
          adjuntoNombre: uploaded?.nombre || formFile?.name || "",
          adjuntoPath: uploaded?.path || "",
          adjuntoTipo: uploaded?.tipo || formFile?.type || "",
          adjuntoSize: uploaded?.size || formFile?.size || 0,
        },
        currentUser
      );

      await loadData();
      setModal(null);
      setForm(emptyForm);
      setFormFile(null);
    } catch (error) {
      console.error("Error creando ticket:", error);
      alert(error.message || "No se pudo crear el ticket.");
    } finally {
      setSaving(false);
    }
  }

  function openDetail(ticket) {
    setSelectedTicket(ticket);
    setScreenshotUrl("");
    setAdminDraft({
      estado: ticket.estado,
      prioridadInterna: ticket.prioridadInterna || ticket.prioridad,
    });
    setCommentDraft("");
    setModal("detalle");
  }

  async function handleSaveAdmin() {
    if (!selectedTicket || !admin) return;

    setSaving(true);

    try {
      await updateTicketAdmin(selectedTicket.id, adminDraft);
      await loadData();
      const updated = (await getTickets(currentUser)).find(
        (ticket) => ticket.id === selectedTicket.id
      );
      if (updated) setSelectedTicket(updated);
    } catch (error) {
      console.error("Error actualizando ticket:", error);
      alert(error.message || "No se pudo actualizar el ticket.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment(event) {
    event.preventDefault();
    if (!selectedTicket || !commentDraft.trim()) return;

    setSaving(true);

    try {
      await addTicketComment(selectedTicket.id, commentDraft.trim(), currentUser);
      const data = await getTickets(currentUser);
      setTickets(data || []);
      const updated = data.find((ticket) => ticket.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
      setCommentDraft("");
    } catch (error) {
      console.error("Error agregando comentario:", error);
      alert(error.message || "No se pudo agregar el comentario.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page tickets-page">
      <div className="page-header">
        <div>
          <h2>Tickets</h2>
          <p>
            Reporte y seguimiento de problemas, solicitudes y mejoras.
            {!admin ? " Estas viendo tus propios tickets." : " Vista administrativa completa."}
          </p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="primary-button" onClick={openCreateModal}>
            <Plus size={16} /> Nuevo ticket
          </button>
        </div>
      </div>

      <div className="stats-grid small">
        <div className="stat-card">
          <div>
            <span>Abiertos</span>
            <strong>{abiertos}</strong>
            <small>Pendientes de revision</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>En proceso</span>
            <strong>{enProceso}</strong>
            <small>Con respuesta en curso</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>Urgentes</span>
            <strong>{urgentes}</strong>
            <small>Prioridad maxima</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>Finalizados</span>
            <strong>{resueltos}</strong>
            <small>Resueltos o cerrados</small>
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <input
          placeholder="Buscar por codigo, titulo, descripcion o usuario..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={estadoFiltro} onChange={(event) => setEstadoFiltro(event.target.value)}>
          <option>Todos</option>
          {ESTADOS.map((estado) => (
            <option key={estado}>{estado}</option>
          ))}
        </select>

        <select
          value={prioridadFiltro}
          onChange={(event) => setPrioridadFiltro(event.target.value)}
        >
          <option>Todas</option>
          {PRIORIDADES.map((prioridad) => (
            <option key={prioridad}>{prioridad}</option>
          ))}
        </select>
      </div>

      <div className="table-card tickets-table">
        <table>
          <thead>
            <tr>
              <th>Numero</th>
              <th>Titulo</th>
              <th>Descripcion</th>
              <th>Categoria</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th>Usuario</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="9">Cargando tickets...</td>
              </tr>
            )}

            {!loading &&
              filteredTickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.codigo}</td>
                  <td>{ticket.titulo}</td>
                  <td>{resumen(ticket.descripcion)}</td>
                  <td>{ticket.categoria}</td>
                  <td>
                    <span className={`status-badge ${getStatusClass(ticket.prioridadInterna)}`}>
                      {ticket.prioridadInterna || ticket.prioridad}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${getStatusClass(ticket.estado)}`}>
                      {ticket.estado}
                    </span>
                  </td>
                  <td>{ticket.usuarioNombre}</td>
                  <td>{ticket.fecha}</td>
                  <td>
                    <div className="table-actions">
                      <button onClick={() => openDetail(ticket)} title="Ver detalle">
                        <Eye size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

            {!loading && filteredTickets.length === 0 && (
              <tr>
                <td colSpan="9">No se encontraron tickets.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="tickets-mobile-list">
        {loading && <div className="ticket-mobile-card">Cargando tickets...</div>}
        {!loading &&
          filteredTickets.map((ticket) => (
            <button
              type="button"
              className="ticket-mobile-card"
              key={ticket.id}
              onClick={() => openDetail(ticket)}
            >
              <div className="ticket-mobile-card-header">
                <strong>{ticket.codigo}</strong>
                <span className={`status-badge ${getStatusClass(ticket.estado)}`}>
                  {ticket.estado}
                </span>
              </div>
              <h3>{ticket.titulo}</h3>
              <p>{resumen(ticket.descripcion, 140)}</p>
              <div className="ticket-mobile-meta">
                <span>{ticket.categoria}</span>
                <span>{ticket.prioridadInterna || ticket.prioridad}</span>
                <span>{ticket.fecha}</span>
              </div>
            </button>
          ))}
      </div>

      {modal === "nuevo" && (
        <Modal title="Nuevo ticket" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label className="full">
              Titulo
              <input
                required
                value={form.titulo}
                onChange={(event) => setForm({ ...form, titulo: event.target.value })}
                placeholder="Ej. No puedo emitir una factura"
              />
            </label>

            <label>
              Categoria
              <select
                value={form.categoria}
                onChange={(event) => setForm({ ...form, categoria: event.target.value })}
              >
                {CATEGORIAS.map((categoria) => (
                  <option key={categoria}>{categoria}</option>
                ))}
              </select>
            </label>

            <label>
              Prioridad
              <select
                value={form.prioridad}
                onChange={(event) => setForm({ ...form, prioridad: event.target.value })}
              >
                {PRIORIDADES.map((prioridad) => (
                  <option key={prioridad}>{prioridad}</option>
                ))}
              </select>
            </label>

            <label className="full">
              Descripcion
              <textarea
                required
                value={form.descripcion}
                onChange={(event) => setForm({ ...form, descripcion: event.target.value })}
                placeholder="Contanos que paso, donde lo viste y que esperabas que ocurra."
              />
            </label>

            <div className="full ticket-file-row">
              <input ref={fileInputRef} type="file" hidden onChange={handleFileChange} />
              <button
                type="button"
                className="secondary-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={16} /> Adjuntar archivo
              </button>
              {formFile && (
                <small>
                  {formFile.name} {formatFileSize(formFile.size)}
                </small>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                <Send size={16} /> {saving ? "Creando..." : "Crear ticket"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "detalle" && selectedTicket && (
        <Modal title={`Ticket ${selectedTicket.codigo}`} onClose={() => setModal(null)} size="wide">
          <div className="ticket-detail">
            <div className="detail-grid">
              <div>
                <span>Titulo</span>
                <strong>{selectedTicket.titulo}</strong>
              </div>
              <div>
                <span>Categoria</span>
                <strong>{selectedTicket.categoria}</strong>
              </div>
              <div>
                <span>Prioridad solicitada</span>
                <strong>{selectedTicket.prioridad}</strong>
              </div>
              <div>
                <span>Estado</span>
                <strong>{selectedTicket.estado}</strong>
              </div>
              <div>
                <span>Usuario creador</span>
                <strong>{selectedTicket.usuarioNombre}</strong>
              </div>
              <div>
                <span>Fecha</span>
                <strong>{selectedTicket.fecha}</strong>
              </div>
              <div className="full">
                <span>Descripcion</span>
                <strong>{selectedTicket.descripcion}</strong>
              </div>
              {(selectedTicket.adjuntoNombre || selectedTicket.adjuntoPath) && (
                <div className="full">
                  <span>Adjunto</span>
                  <strong>
                    <Paperclip size={15} /> {selectedTicket.adjuntoNombre || selectedTicket.adjuntoPath}
                  </strong>
                </div>
              )}
              <div className="full ticket-screenshot-detail">
                <span>Captura</span>
                {selectedTicket.screenshotPath ? (
                  screenshotUrl ? (
                    <a href={screenshotUrl} target="_blank" rel="noreferrer">
                      <img
                        className="ticket-screenshot-preview"
                        src={screenshotUrl}
                        alt={`Captura del ticket ${selectedTicket.codigo}`}
                      />
                    </a>
                  ) : (
                    <strong>Cargando captura...</strong>
                  )
                ) : (
                  <strong>No hay captura disponible.</strong>
                )}
              </div>
            </div>

            {admin && (
              <div className="ticket-admin-panel">
                <h3>Gestion administrativa</h3>
                <div className="form-grid">
                  <label>
                    Estado
                    <select
                      value={adminDraft.estado}
                      onChange={(event) =>
                        setAdminDraft({ ...adminDraft, estado: event.target.value })
                      }
                    >
                      {ESTADOS.map((estado) => (
                        <option key={estado}>{estado}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prioridad interna
                    <select
                      value={adminDraft.prioridadInterna}
                      onChange={(event) =>
                        setAdminDraft({ ...adminDraft, prioridadInterna: event.target.value })
                      }
                    >
                      {PRIORIDADES.map((prioridad) => (
                        <option key={prioridad}>{prioridad}</option>
                      ))}
                    </select>
                  </label>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleSaveAdmin}
                      disabled={saving}
                    >
                      Guardar cambios
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="ticket-comments">
              <h3>
                <MessageSquarePlus size={18} /> Historial y comentarios
              </h3>

              <div className="ticket-comment-list">
                {selectedTicket.comentarios?.length > 0 ? (
                  selectedTicket.comentarios.map((comment) => (
                    <div className="ticket-comment" key={comment.id}>
                      <div>
                        <strong>{comment.usuarioNombre}</strong>
                        <span>{comment.fecha}</span>
                      </div>
                      <p>{comment.comentario}</p>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">Todavia no hay comentarios.</div>
                )}
              </div>

              <form className="ticket-comment-form" onSubmit={handleAddComment}>
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Agregar comentario o respuesta..."
                />
                <div className="modal-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving || !commentDraft.trim()}
                  >
                    <Ticket size={16} /> Responder
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
