import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Eye, CheckCircle, Upload, RefreshCw } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import jsQR from "jsqr";
import Modal from "../components/Modal";
import { getSedes } from "../services/sedeService";
import {
  createDocumento,
  deleteDocumento,
  getDocumentos,
  updateEstadoDocumento,
} from "../services/documentoService";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const emptyForm = {
  fecha: new Date().toISOString().split("T")[0],
  tipo: "Factura",
  descripcion: "",
  asociadoA: "",
  sedeId: "",
  archivo: "",
  estado: "Pendiente revisión",
};

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getStatusClass(text) {
  return normalizeText(text).replaceAll(" ", "-");
}

function decodeBase64Url(base64Url) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const jsonString = decodeURIComponent(escape(atob(padded)));

  return JSON.parse(jsonString);
}

function extraerDatosQRFiscal(qrText) {
  const url = new URL(qrText);
  const p = url.searchParams.get("p");

  if (!p) {
    throw new Error("El QR no contiene datos fiscales válidos.");
  }

  return decodeBase64Url(p);
}

function tipoComprobanteLabel(codigo) {
  const tipos = {
    1: "Factura A",
    2: "Nota de Débito A",
    3: "Nota de Crédito A",
    6: "Factura B",
    7: "Nota de Débito B",
    8: "Nota de Crédito B",
    11: "Factura C",
    12: "Nota de Débito C",
    13: "Nota de Crédito C",
    51: "Factura M",
  };

  return tipos[codigo] || `Comprobante ${codigo}`;
}

function formatFecha(fecha) {
  if (!fecha) return "";

  if (fecha.includes("-")) {
    const [yyyy, mm, dd] = fecha.split("-");
    return `${dd}/${mm}/${yyyy}`;
  }

  return fecha;
}

function formatImporte(value) {
  if (value === undefined || value === null) return "-";

  return Number(value).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });
}

export default function Documentos({ selectedSede, sedeId }) {
  const facturaInputRef = useRef(null);

  const [documentos, setDocumentos] = useState([]);
  const [sedes, setSedes] = useState([]);

  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");

  const [modal, setModal] = useState(null);
  const [selectedDocumento, setSelectedDocumento] = useState(null);
  const [importandoFactura, setImportandoFactura] = useState(false);

  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const selectedSedeName =
    typeof selectedSede === "object" && selectedSede !== null
      ? selectedSede.nombre
      : selectedSede || "Todas las sedes";

  const sedeBloqueada = sedeId && sedeId !== "todas";

  async function loadData(currentSedeId = sedeId) {
    setLoading(true);

    try {
      const idParaFiltro = currentSedeId === "todas" ? null : currentSedeId;

      const [documentosData, sedesData] = await Promise.all([
        getDocumentos(idParaFiltro),
        getSedes(),
      ]);

      setDocumentos(documentosData || []);
      setSedes(sedesData || []);

      setForm((prev) => ({
        ...prev,
        sedeId: prev.sedeId || idParaFiltro || sedesData?.[0]?.id || "",
      }));
    } catch (error) {
      console.error("Error cargando documentos:", error);
      alert(error.message || "No se pudieron cargar los documentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(sedeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId]);

  const documentosPorSede = documentos;

  const documentosFiltrados = useMemo(() => {
    const searchValue = normalizeText(search);

    return documentosPorSede.filter((item) => {
      const matchSearch =
        !searchValue ||
        normalizeText(item.descripcion).includes(searchValue) ||
        normalizeText(item.asociadoA).includes(searchValue) ||
        normalizeText(item.archivo).includes(searchValue) ||
        normalizeText(item.sede).includes(searchValue);

      const matchTipo = tipoFiltro === "Todos" || item.tipo === tipoFiltro;

      return matchSearch && matchTipo;
    });
  }, [documentosPorSede, search, tipoFiltro]);

  const total = documentosPorSede.length;
  const pendientes = documentosPorSede.filter((d) => d.estado === "Pendiente revisión").length;
  const validados = documentosPorSede.filter((d) => d.estado === "Validado").length;
  const conciliados = documentosPorSede.filter((d) => d.estado === "Conciliado").length;

  function openNuevo() {
    setForm({
      ...emptyForm,
      fecha: new Date().toISOString().split("T")[0],
      sedeId: sedeBloqueada ? sedeId : sedes[0]?.id || "",
    });

    setModal("nuevo");
  }

  async function handleCreate(e) {
    e.preventDefault();

    setSaving(true);

    try {
      await createDocumento({
        ...form,
        archivo: form.archivo || "archivo_simulado.pdf",
      });

      await loadData(sedeId);

      setForm({
        ...emptyForm,
        fecha: new Date().toISOString().split("T")[0],
        sedeId: sedeBloqueada ? sedeId : sedes[0]?.id || "",
      });

      setModal(null);
    } catch (error) {
      console.error("Error guardando documento:", error);
      alert(error.message || "No se pudo guardar el documento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm("¿Eliminar este documento?");
    if (!confirmed) return;

    setDeletingId(id);

    try {
      await deleteDocumento(id);
      await loadData(sedeId);
    } catch (error) {
      console.error("Error eliminando documento:", error);
      alert(error.message || "No se pudo eliminar el documento.");
    } finally {
      setDeletingId(null);
    }
  }

  async function validarDocumento(id) {
    setUpdatingId(id);

    try {
      await updateEstadoDocumento(id, "Validado");
      await loadData(sedeId);
    } catch (error) {
      console.error("Error validando documento:", error);
      alert(error.message || "No se pudo validar el documento.");
    } finally {
      setUpdatingId(null);
    }
  }

  function abrirDetalle(documento) {
    setSelectedDocumento(documento);
    setModal("detalle");
  }

  async function leerQRDesdePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.5 });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imageData.data, canvas.width, canvas.height);

      if (qr?.data) {
        return qr.data;
      }
    }

    throw new Error("No se encontró ningún código QR en el PDF.");
  }

  async function importarFacturaFiscal(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportandoFactura(true);

      const qrText = await leerQRDesdePDF(file);
      const datos = extraerDatosQRFiscal(qrText);

      const tipoComprobante = tipoComprobanteLabel(datos.tipoCmp);
      const puntoVenta = String(datos.ptoVta || "").padStart(4, "0");
      const numeroComprobante = String(datos.nroCmp || "").padStart(8, "0");

      await createDocumento({
        fecha: datos.fecha,
        tipo: "Factura",
        descripcion: `${tipoComprobante} ${puntoVenta}-${numeroComprobante} - ${formatImporte(datos.importe)}`,
        asociadoA: `CUIT ${datos.cuit}`,
        sedeId: sedeBloqueada ? sedeId : form.sedeId || sedes[0]?.id || null,
        archivo: file.name,
        estado: "Pendiente revisión",
        datosFiscales: {
          ...datos,
          qrUrl: qrText,
          tipoComprobante,
          puntoVenta,
          numeroComprobante,
        },
      });

      await loadData(sedeId);
    } catch (error) {
      console.error("Error importando factura:", error);
      alert(error.message || "No se pudo importar la factura.");
    } finally {
      setImportandoFactura(false);
      e.target.value = "";
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Documentos</h2>
          <p>
            Facturas, comprobantes, extractos, resultados y archivos asociados.
            {selectedSedeName ? ` Vista actual: ${selectedSedeName}.` : ""}
          </p>
        </div>

        <div className="header-actions">
          <input
            ref={facturaInputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={importarFacturaFiscal}
          />

          <button
            className="secondary-button"
            onClick={() => loadData(sedeId)}
            disabled={loading}
          >
            <RefreshCw size={16} /> Actualizar
          </button>

          <button
            className="secondary-button"
            onClick={() => facturaInputRef.current?.click()}
            disabled={importandoFactura}
          >
            <Upload size={16} />
            {importandoFactura ? "Leyendo factura..." : "Importar factura PDF"}
          </button>

          <button className="primary-button" onClick={openNuevo}>
            <Plus size={16} /> Subir documento
          </button>
        </div>
      </div>

      <div className="stats-grid small">
        <div className="stat-card">
          <div>
            <span>Documentos</span>
            <strong>{total}</strong>
            <small>Total cargado</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Pendientes</span>
            <strong>{pendientes}</strong>
            <small>Requieren revisión</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Validados</span>
            <strong>{validados}</strong>
            <small>Listos para auditoría</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Conciliados</span>
            <strong>{conciliados}</strong>
            <small>Asociados a movimientos</small>
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <input
          placeholder="Buscar por descripción, entidad, sede o archivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
          <option>Todos</option>
          <option>Factura</option>
          <option>Comprobante</option>
          <option>Extracto bancario</option>
          <option>Resultado clínico</option>
          <option>Contrato</option>
        </select>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th>Asociado a</th>
              <th>Sede</th>
              <th>Archivo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="8">Cargando documentos...</td>
              </tr>
            )}

            {!loading &&
              documentosFiltrados.map((item) => (
                <tr key={item.id}>
                  <td>{item.fecha}</td>
                  <td>{item.tipo}</td>
                  <td>{item.descripcion}</td>
                  <td>{item.asociadoA}</td>
                  <td>{item.sede}</td>
                  <td>{item.archivo}</td>
                  <td>
                    <span className={`status-badge ${getStatusClass(item.estado)}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button onClick={() => abrirDetalle(item)} title="Ver detalle">
                        <Eye size={16} />
                      </button>

                      {item.estado === "Pendiente revisión" && (
                        <button
                          onClick={() => validarDocumento(item.id)}
                          disabled={updatingId === item.id}
                          title="Validar documento"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

            {!loading && documentosFiltrados.length === 0 && (
              <tr>
                <td colSpan="8">No se encontraron documentos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === "nuevo" && (
        <Modal title="Subir documento" onClose={() => setModal(null)}>
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
              Tipo
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                <option>Factura</option>
                <option>Comprobante</option>
                <option>Extracto bancario</option>
                <option>Resultado clínico</option>
                <option>Contrato</option>
              </select>
            </label>

            <label>
              Asociado a
              <input
                required
                value={form.asociadoA}
                onChange={(e) => setForm({ ...form, asociadoA: e.target.value })}
              />
            </label>

            <label>
              Sede
              <select
                value={form.sedeId}
                onChange={(e) => setForm({ ...form, sedeId: e.target.value })}
                disabled={sedeBloqueada}
              >
                <option value="">Todas</option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="full">
              Descripción
              <input
                required
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </label>

            <label className="full">
              Archivo simulado
              <input
                value={form.archivo}
                onChange={(e) => setForm({ ...form, archivo: e.target.value })}
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
                {saving ? "Guardando..." : "Guardar documento"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "detalle" && selectedDocumento && (
        <Modal title="Detalle del documento" onClose={() => setModal(null)}>
          <div className="detail-grid">
            <div>
              <span>Tipo</span>
              <strong>{selectedDocumento.tipo}</strong>
            </div>

            <div>
              <span>Fecha</span>
              <strong>{selectedDocumento.fecha}</strong>
            </div>

            <div>
              <span>Asociado a</span>
              <strong>{selectedDocumento.asociadoA}</strong>
            </div>

            <div>
              <span>Sede</span>
              <strong>{selectedDocumento.sede}</strong>
            </div>

            <div className="full">
              <span>Archivo</span>
              <strong>{selectedDocumento.archivo}</strong>
            </div>

            <div className="full">
              <span>Descripción</span>
              <strong>{selectedDocumento.descripcion}</strong>
            </div>

            {selectedDocumento.datosFiscales && (
              <>
                <div>
                  <span>CUIT emisor</span>
                  <strong>{selectedDocumento.datosFiscales.cuit}</strong>
                </div>

                <div>
                  <span>Tipo comprobante</span>
                  <strong>{selectedDocumento.datosFiscales.tipoComprobante}</strong>
                </div>

                <div>
                  <span>Punto de venta</span>
                  <strong>{selectedDocumento.datosFiscales.puntoVenta}</strong>
                </div>

                <div>
                  <span>N° comprobante</span>
                  <strong>{selectedDocumento.datosFiscales.numeroComprobante}</strong>
                </div>

                <div>
                  <span>Importe</span>
                  <strong>{formatImporte(selectedDocumento.datosFiscales.importe)}</strong>
                </div>

                <div>
                  <span>Moneda</span>
                  <strong>{selectedDocumento.datosFiscales.moneda || "-"}</strong>
                </div>

                <div>
                  <span>Cotización</span>
                  <strong>{selectedDocumento.datosFiscales.ctz || "-"}</strong>
                </div>

                <div>
                  <span>CAE / CAEA</span>
                  <strong>{selectedDocumento.datosFiscales.codAut || "-"}</strong>
                </div>

                <div>
                  <span>Documento receptor</span>
                  <strong>{selectedDocumento.datosFiscales.nroDocRec || "-"}</strong>
                </div>

                <div className="full">
                  <span>QR fiscal</span>
                  <strong>{selectedDocumento.datosFiscales.qrUrl}</strong>
                </div>
              </>
            )}

            <div className="full document-preview">Vista previa simulada del documento</div>
          </div>
        </Modal>
      )}
    </section>
  );
}