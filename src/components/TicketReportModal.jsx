import { useRef, useState } from "react";
import { AlertTriangle, Paperclip, Send, X } from "lucide-react";

import TicketScreenshotEditor from "./TicketScreenshotEditor";
import {
  addTicketAttachment,
  createTicket,
  updateTicketScreenshot,
  uploadTicketFile,
} from "../services/ticketService";
import { uploadArchivo } from "../services/storageService";

const CATEGORIAS = ["Error", "Mejora", "Consulta", "Configuraci\u00f3n"];
const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizePathPart(value) {
  return String(value || "ticket")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

export default function TicketReportModal({
  currentUser,
  currentPage,
  screenshot,
  onClose,
  onCreated,
}) {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    titulo: "",
    categoria: "Error",
    prioridad: "Media",
    descripcion: "",
  });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleFilesChange(event) {
    setFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setWarning("");

    if (!form.titulo.trim() || !form.descripcion.trim()) {
      setError("Completa titulo y descripcion.");
      return;
    }

    setSubmitting(true);

    try {
      const ticket = await createTicket(
        {
          ...form,
          titulo: form.titulo.trim(),
          descripcion: form.descripcion.trim(),
          pageUrl: window.location.href,
          pagePath: currentPage || window.location.pathname,
          browserInfo: navigator.userAgent,
        },
        currentUser
      );

      let screenshotPath = "";
      const screenshotBlob = screenshot ? await editorRef.current?.toBlob() : null;

      if (screenshotBlob) {
        try {
          const fileName = `${sanitizePathPart(ticket.codigo || ticket.id)}.png`;
          const screenshotFile = new File([screenshotBlob], fileName, { type: "image/png" });
          const uploaded = await uploadTicketFile(
            `tickets/screenshots/${fileName}`,
            screenshotFile
          );
          screenshotPath = uploaded.path;
          await updateTicketScreenshot(ticket.id, {
            screenshotPath,
            pageUrl: window.location.href,
            pagePath: currentPage || window.location.pathname,
            browserInfo: navigator.userAgent,
          });
        } catch (screenshotError) {
          console.warn("El ticket fue creado, pero no se pudo guardar la captura:", screenshotError);
          setWarning(
            screenshotError.message ||
              "El ticket fue creado, pero no se pudo guardar la captura."
          );
        }
      }

      for (const file of files) {
        const uploaded = await uploadArchivo(file, "tickets");
        await addTicketAttachment(ticket.id, uploaded);
      }

      await onCreated?.({ ...ticket, screenshotPath });
      onClose();
    } catch (submitError) {
      setError(submitError.message || "No se pudo crear el ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="ticket-report-overlay ticket-report-modal-overlay"
      data-ticket-report-modal
      onClick={onClose}
    >
      <form className="ticket-report-modal" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <div className="ticket-report-modal-header">
          <div>
            <h2>Reportar problema</h2>
            <p>Se adjuntara la captura de la pantalla actual al ticket.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="ticket-report-modal-body">
          {screenshot ? (
            <TicketScreenshotEditor ref={editorRef} screenshot={screenshot} />
          ) : (
            <div className="ticket-report-error">
              No hay captura disponible. Podes crear el ticket manualmente.
            </div>
          )}

          <div className="form-grid">
            <label className="full">
              Titulo
              <input
                required
                value={form.titulo}
                onChange={(event) => updateField("titulo", event.target.value)}
                placeholder="Ej. Error al guardar un comprobante"
              />
            </label>

            <label>
              Categoria
              <select
                value={form.categoria}
                onChange={(event) => updateField("categoria", event.target.value)}
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
                onChange={(event) => updateField("prioridad", event.target.value)}
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
                onChange={(event) => updateField("descripcion", event.target.value)}
                placeholder="Contanos que paso, donde lo viste y que esperabas que ocurra."
              />
            </label>

            <div className="full ticket-file-row">
              <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                onChange={handleFilesChange}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={16} /> Adjuntar archivos
              </button>
              {files.length > 0 && (
                <small>
                  {files.length} archivo(s),{" "}
                  {formatFileSize(files.reduce((total, file) => total + file.size, 0))}
                </small>
              )}
            </div>
          </div>

          {error && (
            <div className="ticket-report-error">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
          {warning && (
            <div className="ticket-report-error warning">
              <AlertTriangle size={16} />
              {warning}
            </div>
          )}
        </div>

        <div className="ticket-report-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={submitting}>
            <Send size={16} />
            {submitting ? "Creando..." : "Crear ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
