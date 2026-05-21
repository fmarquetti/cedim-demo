import { Fragment, useEffect, useMemo, useState } from "react";
import {
  downloadArcaInvoicePdf,
  emitArcaInvoice,
  getArcaInvoiceEvents,
  getArcaInvoicePdfUrl,
  listArcaInvoices,
  sendArcaInvoiceEmail,
} from "../services/arcaInvoices";

const INITIAL_FORM = {
  cliente_nombre: "",
  cliente_documento: "0",
  cliente_iva: "Consumidor Final",
  domicilio: "",
  concepto: "Servicios medicos",
  descripcion: "Prestacion medica CEDIM",
  importe_neto: "",
  importe_iva: "0",
  importe_total: "",
  tipo_comprobante: "6",
  punto_venta: "1",
  comprobante_asociado_id: "",
  comprobante_asociado_tipo: "",
  comprobante_asociado_punto_venta: "",
  comprobante_asociado_numero: "",
  motivo: "",
};

const INVOICES_PER_PAGE = 10;

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("es-AR");
  } catch {
    return "-";
  }
}

function formatDateTime(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("es-AR");
  } catch {
    return "-";
  }
}

function formatVoucher(invoice) {
  if (!invoice?.punto_venta || !invoice?.numero_comprobante) return "-";

  const puntoVenta = String(invoice.punto_venta).padStart(4, "0");
  const numero = String(invoice.numero_comprobante).padStart(8, "0");

  return `${puntoVenta}-${numero}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function compareValues(a, b, field) {
  if (field === "created_at") {
    return (
      new Date(a.created_at || 0).getTime() -
      new Date(b.created_at || 0).getTime()
    );
  }

  if (field === "cliente_nombre") {
    return normalizeText(a.cliente_nombre).localeCompare(
      normalizeText(b.cliente_nombre),
    );
  }

  if (field === "cliente_documento") {
    return normalizeText(a.cliente_documento).localeCompare(
      normalizeText(b.cliente_documento),
    );
  }

  return 0;
}

function getVoucherLetter(tipoComprobante) {
  const labels = {
    1: "A",
    2: "A",
    3: "A",
    6: "B",
    7: "B",
    8: "B",
    11: "C",
    12: "C",
    13: "C",
  };

  return labels[Number(tipoComprobante)] || "B";
}

function isTipoC(tipoComprobante) {
  return [11, 12, 13].includes(Number(tipoComprobante));
}

function isFactura(tipoComprobante) {
  return [1, 6, 11].includes(Number(tipoComprobante));
}

function isNotaCredito(tipoComprobante) {
  return [3, 8, 13].includes(Number(tipoComprobante));
}

function isNotaDebito(tipoComprobante) {
  return [2, 7, 12].includes(Number(tipoComprobante));
}

function requiresAssociatedVoucher(tipoComprobante) {
  return isNotaCredito(tipoComprobante) || isNotaDebito(tipoComprobante);
}

function getVoucherTypeLabel(tipoComprobante) {
  const labels = {
    1: "Factura A",
    2: "Nota de Debito A",
    3: "Nota de Credito A",
    6: "Factura B",
    7: "Nota de Debito B",
    8: "Nota de Credito B",
    11: "Factura C",
    12: "Nota de Debito C",
    13: "Nota de Credito C",
  };

  return labels[Number(tipoComprobante)] || "Factura B";
}

function getEstadoLabel(estado) {
  if (!estado) return "pendiente";

  const labels = {
    pendiente: "Pendiente",
    procesando: "Procesando",
    emitida: "Emitida",
    error: "Error",
    anulada: "Anulada",
  };

  return labels[estado] || estado;
}

function getLastActionLabel(action) {
  const labels = {
    emitted: "Generada",
    pdf_generated: "PDF generado",
    pdf_downloaded: "PDF descargado",
    email_sent: "Enviada por mail",
    pdf_opened: "PDF abierto",
  };

  return labels[action] || "-";
}

function getEventTypeLabel(eventType) {
  const labels = {
    emitted: "Factura emitida",
    pdf_generated: "PDF generado",
    pdf_opened: "PDF abierto",
    pdf_downloaded: "PDF descargado",
    email_sent: "Mail enviado",
    email_failed: "Mail fallido",
  };

  return labels[eventType] || eventType;
}

function hasInvoicePdf(invoice) {
  return Boolean(invoice?.pdf_storage_path || invoice?.pdf_url);
}

function OperationOverlay({ operation, onClose }) {
  if (!operation.active) return null;

  return (
    <div className="operation-overlay-backdrop" role="status" aria-live="polite">
      <div className="operation-card">
        {operation.status === "loading" && <div className="operation-spinner" />}
        {operation.status === "success" && <div className="operation-success">OK</div>}
        {operation.status === "error" && <div className="operation-error">!</div>}

        <div>
          <h3>{operation.title}</h3>
          <p>{operation.message}</p>
        </div>

        {operation.status !== "loading" && (
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        )}
      </div>
    </div>
  );
}

export default function Facturacion() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [invoices, setInvoices] = useState([]);
  const [lastIssuedInvoice, setLastIssuedInvoice] = useState(null);

  const [emitting, setEmitting] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [pdfActionLoading, setPdfActionLoading] = useState("");
  const [operation, setOperation] = useState({
    active: false,
    type: "",
    title: "",
    message: "",
    status: "idle",
  });
  const [activityInvoiceId, setActivityInvoiceId] = useState("");
  const [invoiceEvents, setInvoiceEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [emailModal, setEmailModal] = useState({
    open: false,
    invoice: null,
    email: "",
    error: "",
    sending: false,
  });
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceSort, setInvoiceSort] = useState({
    field: "created_at",
    direction: "desc",
  });
  const [invoicePage, setInvoicePage] = useState(1);

  const [message, setMessage] = useState("");

  const previewInvoice = lastIssuedInvoice || {
    ...form,
    tipo_comprobante: Number(form.tipo_comprobante || 6),
    punto_venta: Number(form.punto_venta || 1),
    importe_neto: Number(form.importe_neto || 0),
    importe_iva: isTipoC(form.tipo_comprobante) ? 0 : Number(form.importe_iva || 0),
    importe_total: isTipoC(form.tipo_comprobante)
      ? Number(form.importe_neto || 0)
      : Number(form.importe_total || 0),
  };
  const previewDate = previewInvoice.emitted_at || new Date().toISOString();
  const formIsTipoC = isTipoC(form.tipo_comprobante);
  const previewIsTipoC = isTipoC(previewInvoice.tipo_comprobante);
  const formRequiresAssociatedVoucher = requiresAssociatedVoucher(
    form.tipo_comprobante,
  );
  const emittedInvoices = invoices.filter(
    (invoice) => invoice.estado === "emitida" && isFactura(invoice.tipo_comprobante),
  );
  const filteredInvoices = useMemo(() => {
    const query = normalizeText(invoiceSearch);

    return invoices.filter((invoice) => {
      if (!query) return true;

      const searchable = normalizeText(
        [
          invoice.cliente_nombre,
          invoice.cliente_documento,
          invoice.cliente_iva,
          invoice.concepto,
          invoice.descripcion,
          invoice.numero_comprobante,
          invoice.cae,
          getVoucherTypeLabel(invoice.tipo_comprobante),
          formatVoucher(invoice),
          getEstadoLabel(invoice.estado),
          getLastActionLabel(invoice.last_action),
          invoice.last_action,
        ].join(" "),
      );

      return searchable.includes(query);
    });
  }, [invoices, invoiceSearch]);
  const sortedInvoices = useMemo(() => {
    return [...filteredInvoices].sort((a, b) => {
      const result = compareValues(a, b, invoiceSort.field);
      return invoiceSort.direction === "asc" ? result : -result;
    });
  }, [filteredInvoices, invoiceSort]);
  const totalInvoicePages = Math.max(
    1,
    Math.ceil(sortedInvoices.length / INVOICES_PER_PAGE),
  );
  const paginatedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * INVOICES_PER_PAGE;
    return sortedInvoices.slice(start, start + INVOICES_PER_PAGE);
  }, [sortedInvoices, invoicePage]);

  async function loadInvoices() {
    setLoadingInvoices(true);

    try {
      const rows = await listArcaInvoices();
      setInvoices(rows || []);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "No se pudieron cargar las facturas ARCA.");
    } finally {
      setLoadingInvoices(false);
    }
  }

  function showOperation({ type, title, message: operationMessage }) {
    setOperation({
      active: true,
      type,
      title,
      message: operationMessage,
      status: "loading",
    });
  }

  function finishOperationSuccess(operationMessage) {
    setOperation((prev) => ({
      ...prev,
      active: true,
      message: operationMessage,
      status: "success",
    }));
  }

  function finishOperationError(operationMessage) {
    setOperation((prev) => ({
      ...prev,
      active: true,
      message: operationMessage,
      status: "error",
    }));
  }

  function clearOperation() {
    setOperation({
      active: false,
      type: "",
      title: "",
      message: "",
      status: "idle",
    });
  }

  function openEmailModal(invoice) {
    setEmailModal({
      open: true,
      invoice,
      email: "",
      error: "",
      sending: false,
    });
  }

  function closeEmailModal() {
    if (emailModal.sending) return;

    setEmailModal({
      open: false,
      invoice: null,
      email: "",
      error: "",
      sending: false,
    });
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function handleInvoiceSort(field) {
    setInvoiceSort((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
    setInvoicePage(1);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInvoices();
  }, []);

  useEffect(() => {
    if (invoicePage > totalInvoicePages) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInvoicePage(totalInvoicePages);
    }
  }, [invoicePage, totalInvoicePages]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((prev) => {
      const next = {
        ...prev,
        [name]: value,
      };

      if (name === "tipo_comprobante" && isTipoC(value)) {
        next.importe_iva = "0";

        if (next.importe_neto) {
          next.importe_total = next.importe_neto;
        }
      }

      if (name === "tipo_comprobante" && !requiresAssociatedVoucher(value)) {
        next.comprobante_asociado_id = "";
        next.comprobante_asociado_tipo = "";
        next.comprobante_asociado_punto_venta = "";
        next.comprobante_asociado_numero = "";
        next.motivo = "";
      }

      if (name === "importe_neto" && isTipoC(next.tipo_comprobante)) {
        next.importe_iva = "0";
        next.importe_total = value;
      }

      return next;
    });
    setLastIssuedInvoice(null);
  }

  function handleAssociatedInvoiceChange(event) {
    const invoiceId = event.target.value;
    const associatedInvoice = invoices.find((invoice) => invoice.id === invoiceId);

    setForm((prev) => {
      if (!associatedInvoice) {
        return {
          ...prev,
          comprobante_asociado_id: "",
          comprobante_asociado_tipo: "",
          comprobante_asociado_punto_venta: "",
          comprobante_asociado_numero: "",
        };
      }

      const next = {
        ...prev,
        comprobante_asociado_id: associatedInvoice.id,
        comprobante_asociado_tipo: String(associatedInvoice.tipo_comprobante || ""),
        comprobante_asociado_punto_venta: String(associatedInvoice.punto_venta || ""),
        comprobante_asociado_numero: String(
          associatedInvoice.numero_comprobante || "",
        ),
        cliente_nombre: associatedInvoice.cliente_nombre || prev.cliente_nombre,
        cliente_documento:
          associatedInvoice.cliente_documento || prev.cliente_documento,
        cliente_iva: associatedInvoice.cliente_iva || prev.cliente_iva,
        domicilio: associatedInvoice.domicilio || prev.domicilio,
        concepto: associatedInvoice.concepto || prev.concepto,
        descripcion: associatedInvoice.descripcion || prev.descripcion,
        importe_neto: String(associatedInvoice.importe_neto || prev.importe_neto),
        importe_iva: isTipoC(prev.tipo_comprobante)
          ? "0"
          : String(associatedInvoice.importe_iva || prev.importe_iva),
        importe_total: String(
          isTipoC(prev.tipo_comprobante)
            ? associatedInvoice.importe_neto || associatedInvoice.importe_total || ""
            : associatedInvoice.importe_total || prev.importe_total,
        ),
      };

      return next;
    });
    setLastIssuedInvoice(null);
  }

  function calcularTotalDesdeNeto() {
    const neto = Number(form.importe_neto || 0);
    const iva = formIsTipoC ? 0 : Number(form.importe_iva || 0);
    const total = neto + iva;

    setForm((prev) => ({
      ...prev,
      importe_iva: formIsTipoC ? "0" : prev.importe_iva,
      importe_total: total.toFixed(2),
    }));
    setLastIssuedInvoice(null);
  }

  function validarFormulario() {
    if (!form.cliente_nombre.trim()) {
      throw new Error("Falta el nombre del cliente.");
    }

    if (!form.cliente_documento.trim()) {
      throw new Error("Falta el DNI/CUIT del cliente.");
    }

    if (!form.concepto.trim()) {
      throw new Error("Falta el concepto de facturacion.");
    }

    if (!Number(form.importe_total || 0) || Number(form.importe_total || 0) <= 0) {
      throw new Error("El total debe ser mayor a cero.");
    }

    if (requiresAssociatedVoucher(form.tipo_comprobante)) {
      if (
        !form.comprobante_asociado_tipo ||
        !form.comprobante_asociado_punto_venta ||
        !form.comprobante_asociado_numero
      ) {
        throw new Error(
          "Las notas de credito/debito requieren un comprobante asociado.",
        );
      }
    }
  }

  function buildPayload() {
    validarFormulario();
    const tipoComprobante = Number(form.tipo_comprobante || 6);
    const neto = Number(form.importe_neto || 0);

    return {
      cliente_nombre: form.cliente_nombre.trim(),
      cliente_documento: form.cliente_documento.trim(),
      cliente_iva: form.cliente_iva,
      domicilio: form.domicilio.trim(),
      concepto: form.concepto.trim(),
      descripcion: form.descripcion.trim(),
      importe_neto: neto,
      importe_iva: isTipoC(tipoComprobante) ? 0 : Number(form.importe_iva || 0),
      importe_total: isTipoC(tipoComprobante)
        ? neto
        : Number(form.importe_total || 0),
      tipo_comprobante: tipoComprobante,
      punto_venta: Number(form.punto_venta || 1),
      comprobante_asociado_id: form.comprobante_asociado_id || null,
      comprobante_asociado_tipo: form.comprobante_asociado_tipo
        ? Number(form.comprobante_asociado_tipo)
        : null,
      comprobante_asociado_punto_venta: form.comprobante_asociado_punto_venta
        ? Number(form.comprobante_asociado_punto_venta)
        : null,
      comprobante_asociado_numero: form.comprobante_asociado_numero
        ? Number(form.comprobante_asociado_numero)
        : null,
      motivo: form.motivo.trim(),
    };
  }

  async function handleEmitirFacturaArca(event) {
    event.preventDefault();

    setEmitting(true);
    setMessage("");
    let operationStarted = false;

    try {
      const payload = buildPayload();
      showOperation({
        type: "emit",
        title: "Generando factura",
        message: "Estamos emitiendo el comprobante en ARCA y generando el PDF.",
      });
      operationStarted = true;
      const invoice = await emitArcaInvoice(payload);
      setLastIssuedInvoice(invoice);
      finishOperationSuccess("Factura generada correctamente.");

      setMessage(
        [
          `Factura emitida correctamente. Comprobante ${formatVoucher(
            invoice,
          )}. CAE: ${invoice.cae || "-"}`,
          invoice.warning_pdf ? `PDF pendiente: ${invoice.warning_pdf}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );

      await loadInvoices();
    } catch (error) {
      console.error(error);
      const errorMessage = error.message || "No se pudo emitir la factura ARCA.";
      if (operationStarted) {
        finishOperationError(errorMessage);
      }
      setMessage(errorMessage);
      await loadInvoices();
    } finally {
      setEmitting(false);
    }
  }

  function limpiarFormulario() {
    setForm(INITIAL_FORM);
    setLastIssuedInvoice(null);
    setMessage("");
  }

  async function resolvePdfUrl(invoice) {
    if (!invoice?.id) {
      throw new Error("Primero emiti la factura para generar el PDF.");
    }

    return getArcaInvoicePdfUrl(invoice.id);
  }

  async function handleOpenPdf(invoice) {
    try {
      setPdfActionLoading(`open-${invoice.id}`);
      showOperation({
        type: "open",
        title: "Abriendo PDF",
        message: "Estamos generando el enlace seguro del PDF.",
      });
      const pdfUrl = await resolvePdfUrl(invoice);
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
      finishOperationSuccess("PDF abierto correctamente.");
      await loadInvoices();
    } catch (error) {
      const errorMessage = error.message || "No se pudo abrir el PDF.";
      finishOperationError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setPdfActionLoading("");
    }
  }

  async function handleDownloadPdf(invoice) {
    try {
      setPdfActionLoading(`download-${invoice.id}`);
      showOperation({
        type: "download",
        title: "Preparando descarga",
        message: "Estamos generando el enlace seguro del PDF.",
      });
      await downloadArcaInvoicePdf(invoice);
      finishOperationSuccess("PDF descargado correctamente.");
      await loadInvoices();
    } catch (error) {
      const errorMessage = error.message || "No se pudo descargar el PDF.";
      finishOperationError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setPdfActionLoading("");
    }
  }

  async function handleSendEmailFromModal(event) {
    event.preventDefault();

    const invoice = emailModal.invoice;
    const email = emailModal.email.trim();

    if (!invoice?.id) {
      setEmailModal((prev) => ({
        ...prev,
        error: "No se encontro la factura seleccionada.",
      }));
      return;
    }

    if (!validateEmail(email)) {
      setEmailModal((prev) => ({
        ...prev,
        error: "Ingresa un correo valido.",
      }));
      return;
    }

    try {
      setEmailModal((prev) => ({
        ...prev,
        sending: true,
        error: "",
      }));
      setPdfActionLoading(`email-${invoice.id}`);
      showOperation({
        type: "email",
        title: "Enviando factura por mail",
        message: "Estamos adjuntando el PDF y enviando el correo.",
      });
      const updatedInvoice = await sendArcaInvoiceEmail(invoice.id, email);
      setLastIssuedInvoice((prev) =>
        prev?.id === invoice.id ? updatedInvoice || prev : prev,
      );
      finishOperationSuccess("Factura enviada correctamente.");
      setMessage(`Factura enviada por mail a ${email}.`);
      await loadInvoices();
      setEmailModal({
        open: false,
        invoice: null,
        email: "",
        error: "",
        sending: false,
      });
    } catch (error) {
      const errorMessage =
        error.message || "No se pudo enviar la factura por mail.";
      finishOperationError(errorMessage);
      setEmailModal((prev) => ({
        ...prev,
        sending: false,
        error: errorMessage,
      }));
    } finally {
      setPdfActionLoading("");
    }
  }

  async function handleToggleActivity(invoice) {
    if (activityInvoiceId === invoice.id) {
      setActivityInvoiceId("");
      setInvoiceEvents([]);
      return;
    }

    setLoadingEvents(true);
    setActivityInvoiceId(invoice.id);

    try {
      const events = await getArcaInvoiceEvents(invoice.id);
      setInvoiceEvents(events);
    } catch (error) {
      setInvoiceEvents([]);
      setMessage(error.message || "No se pudo cargar la actividad.");
    } finally {
      setLoadingEvents(false);
    }
  }

  return (
    <div className="page facturacion-page">
      <div className="page-header">
        <div>
          <h1>Facturacion</h1>
          <p>
            Emision de comprobantes ARCA/AFIP desde CEDIM mediante Afip SDK.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={loadInvoices}
            disabled={loadingInvoices}
          >
            {loadingInvoices ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <h2>Nueva factura</h2>
          <p className="muted">
            Carga los datos fiscales y emiti el comprobante mediante Afip SDK.
            Para la primera prueba se recomienda Factura B, consumidor final y
            ambiente de desarrollo.
          </p>

          <form className="form-grid" onSubmit={handleEmitirFacturaArca}>
            <label>
              Cliente / Razon social
              <input
                name="cliente_nombre"
                value={form.cliente_nombre}
                onChange={handleChange}
                placeholder="Consumidor Final / Nombre del paciente"
                required
              />
            </label>

            <label>
              DNI / CUIT
              <input
                name="cliente_documento"
                value={form.cliente_documento}
                onChange={handleChange}
                placeholder="0 para consumidor final"
                required
              />
            </label>

            <label>
              Condicion IVA
              <select
                name="cliente_iva"
                value={form.cliente_iva}
                onChange={handleChange}
              >
                <option value="Consumidor Final">Consumidor Final</option>
                <option value="Responsable Inscripto">
                  Responsable Inscripto
                </option>
                <option value="Monotributista">Monotributista</option>
                <option value="Exento">Exento</option>
              </select>
            </label>

            <label>
              Domicilio
              <input
                name="domicilio"
                value={form.domicilio}
                onChange={handleChange}
                placeholder="Opcional"
              />
            </label>

            <label>
              Tipo comprobante
              <select
                name="tipo_comprobante"
                value={form.tipo_comprobante}
                onChange={handleChange}
              >
                <option value="6">Factura B</option>
                <option value="11">Factura C</option>
                <option value="8">Nota de Credito B</option>
                <option value="13">Nota de Credito C</option>
                <option value="7">Nota de Debito B</option>
                <option value="12">Nota de Debito C</option>
                <option value="1">Factura A</option>
                <option value="3">Nota de Credito A</option>
                <option value="2">Nota de Debito A</option>
              </select>
            </label>

            <label>
              Punto de venta
              <input
                name="punto_venta"
                type="number"
                min="1"
                step="1"
                value={form.punto_venta}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Concepto
              <input
                name="concepto"
                value={form.concepto}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Descripcion
              <input
                name="descripcion"
                value={form.descripcion}
                onChange={handleChange}
                placeholder="Detalle del servicio facturado"
              />
            </label>

            {formRequiresAssociatedVoucher && (
              <div className="associated-voucher-box">
                <h3>Comprobante asociado</h3>

                <label>
                  Seleccionar del historial
                  <select
                    value={form.comprobante_asociado_id}
                    onChange={handleAssociatedInvoiceChange}
                  >
                    <option value="">Cargar manualmente</option>
                    {emittedInvoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {getVoucherTypeLabel(invoice.tipo_comprobante)}{" "}
                        {formatVoucher(invoice)} - {invoice.cliente_nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Tipo asociado
                  <select
                    name="comprobante_asociado_tipo"
                    value={form.comprobante_asociado_tipo}
                    onChange={handleChange}
                    required={formRequiresAssociatedVoucher}
                  >
                    <option value="">Seleccionar</option>
                    <option value="6">Factura B</option>
                    <option value="11">Factura C</option>
                    <option value="1">Factura A</option>
                  </select>
                </label>

                <label>
                  Punto de venta asociado
                  <input
                    name="comprobante_asociado_punto_venta"
                    type="number"
                    min="1"
                    step="1"
                    value={form.comprobante_asociado_punto_venta}
                    onChange={handleChange}
                    required={formRequiresAssociatedVoucher}
                  />
                </label>

                <label>
                  Numero asociado
                  <input
                    name="comprobante_asociado_numero"
                    type="number"
                    min="1"
                    step="1"
                    value={form.comprobante_asociado_numero}
                    onChange={handleChange}
                    required={formRequiresAssociatedVoucher}
                  />
                </label>

                <label>
                  Motivo
                  <input
                    name="motivo"
                    value={form.motivo}
                    onChange={handleChange}
                    placeholder="Anulacion, diferencia de importe, ajuste..."
                  />
                </label>
              </div>
            )}

            <label>
              Importe neto
              <input
                name="importe_neto"
                type="number"
                step="0.01"
                value={form.importe_neto}
                onChange={handleChange}
                placeholder="0.00"
              />
            </label>

            <label>
              IVA
              <input
                name="importe_iva"
                type="number"
                step="0.01"
                value={form.importe_iva}
                onChange={handleChange}
                placeholder="0.00"
                disabled={formIsTipoC}
              />
            </label>

            <label>
              Total
              <input
                name="importe_total"
                type="number"
                step="0.01"
                value={form.importe_total}
                onChange={handleChange}
                placeholder="0.00"
                required
              />
            </label>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={calcularTotalDesdeNeto}
                disabled={emitting}
              >
                Calcular total
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={limpiarFormulario}
                disabled={emitting}
              >
                Limpiar
              </button>

              <button
                type="submit"
                className="btn-primary"
                disabled={emitting}
              >
                {emitting ? "Emitiendo..." : "Emitir con Afip SDK"}
              </button>
            </div>
          </form>

          {message && <div className="notice">{message}</div>}
        </section>

        <section className="card">
          <h2>Vista previa</h2>

          <div className="invoice-preview">
            <div className="invoice-preview-header">
              <div>
                <strong>CEDIM</strong>
                <span>{getVoucherTypeLabel(previewInvoice.tipo_comprobante)}</span>
              </div>

              <div className="invoice-preview-type">
                {getVoucherLetter(previewInvoice.tipo_comprobante)}
              </div>
            </div>

            <div className="invoice-preview-meta">
              <span>Punto de venta</span>
              <strong>{previewInvoice.punto_venta || "1"}</strong>
              <span>Numero</span>
              <strong>
                {previewInvoice.numero_comprobante
                  ? formatVoucher(previewInvoice)
                  : "se asigna al emitir"}
              </strong>
              <span>Fecha</span>
              <strong>{formatDate(previewDate)}</strong>
            </div>

            <div className="invoice-preview-client">
              <div>
                <span>Cliente / razon social</span>
                <strong>{previewInvoice.cliente_nombre || "-"}</strong>
              </div>
              <div>
                <span>DNI/CUIT</span>
                <strong>{previewInvoice.cliente_documento || "-"}</strong>
              </div>
              <div>
                <span>Condicion IVA</span>
                <strong>{previewInvoice.cliente_iva || "Consumidor Final"}</strong>
              </div>
              <div>
                <span>Domicilio</span>
                <strong>{previewInvoice.domicilio || "-"}</strong>
              </div>
            </div>

            <table className="invoice-preview-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Descripcion</th>
                  <th>Neto</th>
                  <th>IVA</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{previewInvoice.concepto || "-"}</td>
                  <td>{previewInvoice.descripcion || "-"}</td>
                  <td>{formatCurrency(previewInvoice.importe_neto)}</td>
                  <td>{formatCurrency(previewInvoice.importe_iva)}</td>
                  <td>{formatCurrency(previewInvoice.importe_total)}</td>
                </tr>
              </tbody>
            </table>

            <div className="invoice-preview-total">
              <span>Total</span>
              <strong>{formatCurrency(previewInvoice.importe_total)}</strong>
            </div>

            {previewIsTipoC && (
              <p className="invoice-preview-note">
                Comprobante C: no discrimina IVA.
              </p>
            )}

            {requiresAssociatedVoucher(previewInvoice.tipo_comprobante) && (
              <p className="invoice-preview-note">
                Asociado: Tipo{" "}
                {previewInvoice.comprobante_asociado_tipo || "-"} - PV{" "}
                {previewInvoice.comprobante_asociado_punto_venta || "-"} - Nro{" "}
                {previewInvoice.comprobante_asociado_numero || "-"}
              </p>
            )}

            <div className="invoice-preview-meta">
              <span>CAE</span>
              <strong>{previewInvoice.cae || "se asigna al emitir"}</strong>
              <span>Vencimiento CAE</span>
              <strong>
                {previewInvoice.cae_vencimiento || "se asigna al emitir"}
              </strong>
            </div>
          </div>

          <div className="invoice-actions">
            {hasInvoicePdf(lastIssuedInvoice) ? (
              <span>PDF disponible</span>
            ) : (
              <span>PDF pendiente</span>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleDownloadPdf(lastIssuedInvoice)}
              disabled={!hasInvoicePdf(lastIssuedInvoice) || Boolean(pdfActionLoading)}
            >
              {pdfActionLoading === `download-${lastIssuedInvoice?.id}`
                ? "Descargando..."
                : "Descargar PDF"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleOpenPdf(lastIssuedInvoice)}
              disabled={!hasInvoicePdf(lastIssuedInvoice) || Boolean(pdfActionLoading)}
            >
              {pdfActionLoading === `open-${lastIssuedInvoice?.id}`
                ? "Abriendo..."
                : "Abrir PDF"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => openEmailModal(lastIssuedInvoice)}
              disabled={!hasInvoicePdf(lastIssuedInvoice) || Boolean(pdfActionLoading)}
            >
              {pdfActionLoading === `email-${lastIssuedInvoice?.id}`
                ? "Enviando..."
                : "Compartir por mail"}
            </button>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div
          className="page-header"
          style={{
            marginBottom: 12,
            padding: 0,
            boxShadow: "none",
            border: 0,
          }}
        >
          <div>
            <h2>Facturas ARCA</h2>
            <p>Ultimos comprobantes registrados desde CEDIM.</p>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={loadInvoices}
            disabled={loadingInvoices}
          >
            {loadingInvoices ? "Cargando..." : "Actualizar listado"}
          </button>
        </div>

        {invoices.length === 0 ? (
          <p className="muted">Todavia no hay facturas registradas.</p>
        ) : (
          <>
            <div className="invoice-list-toolbar">
              <div className="invoice-search">
                <label htmlFor="invoice-search">Buscar factura</label>
                <input
                  id="invoice-search"
                  type="search"
                  value={invoiceSearch}
                  onChange={(event) => {
                    setInvoiceSearch(event.target.value);
                    setInvoicePage(1);
                  }}
                  placeholder="Buscar por cliente, documento, comprobante, CAE..."
                />
              </div>

              <div className="invoice-list-summary">
                Mostrando {paginatedInvoices.length} de {filteredInvoices.length} facturas
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <p className="muted">No se encontraron facturas con ese criterio.</p>
            ) : (
              <>
                <div className="table-card" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <button
                            type="button"
                            className="table-sort-button"
                            onClick={() => handleInvoiceSort("created_at")}
                          >
                            Fecha{" "}
                            {invoiceSort.field === "created_at"
                              ? invoiceSort.direction === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                        </th>
                        <th>Tipo</th>
                        <th>
                          <button
                            type="button"
                            className="table-sort-button"
                            onClick={() => handleInvoiceSort("cliente_nombre")}
                          >
                            Cliente{" "}
                            {invoiceSort.field === "cliente_nombre"
                              ? invoiceSort.direction === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            className="table-sort-button"
                            onClick={() => handleInvoiceSort("cliente_documento")}
                          >
                            Documento{" "}
                            {invoiceSort.field === "cliente_documento"
                              ? invoiceSort.direction === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                        </th>
                        <th>Comprobante</th>
                        <th>Total</th>
                        <th>CAE</th>
                        <th>Estado</th>
                        <th>Ultima accion</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>

                    <tbody>
                      {paginatedInvoices.map((invoice) => {
                        const invoiceHasPdf = hasInvoicePdf(invoice);
                        const isIssued = invoice.estado === "emitida";

                        return (
                          <Fragment key={invoice.id}>
                            <tr>
                              <td>{formatDate(invoice.created_at)}</td>
                              <td>{getVoucherTypeLabel(invoice.tipo_comprobante)}</td>
                              <td>{invoice.cliente_nombre}</td>
                              <td>{invoice.cliente_documento}</td>
                              <td>{formatVoucher(invoice)}</td>
                              <td>{formatCurrency(invoice.importe_total)}</td>
                              <td>{invoice.cae || "-"}</td>
                              <td>
                                <span className={`status-badge ${invoice.estado}`}>
                                  {getEstadoLabel(invoice.estado)}
                                </span>
                              </td>
                              <td>{getLastActionLabel(invoice.last_action)}</td>
                              <td>
                                {isIssued && invoiceHasPdf ? (
                                  <div className="invoice-row-actions">
                                    <button
                                      type="button"
                                      className="invoice-action-button"
                                      onClick={() => handleOpenPdf(invoice)}
                                      disabled={Boolean(pdfActionLoading)}
                                    >
                                      {pdfActionLoading === `open-${invoice.id}`
                                        ? "Abriendo..."
                                        : "Abrir PDF"}
                                    </button>
                                    <button
                                      type="button"
                                      className="invoice-action-button"
                                      onClick={() => handleDownloadPdf(invoice)}
                                      disabled={Boolean(pdfActionLoading)}
                                    >
                                      {pdfActionLoading === `download-${invoice.id}`
                                        ? "Descargando..."
                                        : "Descargar"}
                                    </button>
                                    <button
                                      type="button"
                                      className="invoice-action-button"
                                      onClick={() => openEmailModal(invoice)}
                                      disabled={Boolean(pdfActionLoading)}
                                    >
                                      {pdfActionLoading === `email-${invoice.id}`
                                        ? "Enviando..."
                                        : "Enviar mail"}
                                    </button>
                                    <button
                                      type="button"
                                      className="invoice-action-button"
                                      onClick={() => handleToggleActivity(invoice)}
                                    >
                                      {activityInvoiceId === invoice.id
                                        ? "Ocultar actividad"
                                        : "Ver actividad"}
                                    </button>
                                  </div>
                                ) : (
                                  <span className="muted">PDF pendiente</span>
                                )}
                              </td>
                            </tr>

                            {activityInvoiceId === invoice.id && (
                              <tr>
                                <td colSpan="10">
                                  <div className="invoice-activity-list">
                                    {loadingEvents ? (
                                      <p>Cargando actividad...</p>
                                    ) : invoiceEvents.length === 0 ? (
                                      <p>Sin actividad registrada.</p>
                                    ) : (
                                      invoiceEvents.map((event) => (
                                        <div key={event.id}>
                                          <strong>{getEventTypeLabel(event.event_type)}</strong>
                                          <span>{formatDateTime(event.created_at)}</span>
                                          <span>
                                            {event.user_email || "Usuario no identificado"}
                                          </span>
                                          {event.target_email && (
                                            <span>Destino: {event.target_email}</span>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredInvoices.length > INVOICES_PER_PAGE && (
                  <div className="invoice-pagination">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setInvoicePage((prev) => Math.max(1, prev - 1))}
                      disabled={invoicePage === 1}
                    >
                      Anterior
                    </button>

                    <span>
                      Pagina {invoicePage} de {totalInvoicePages}
                    </span>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setInvoicePage((prev) =>
                          Math.min(totalInvoicePages, prev + 1),
                        )
                      }
                      disabled={invoicePage === totalInvoicePages}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
      {emailModal.open && (
        <div className="modal-backdrop">
          <form className="email-modal" onSubmit={handleSendEmailFromModal}>
            <div className="email-modal-header">
              <div>
                <h3>Enviar factura por mail</h3>
                <p>
                  Comprobante {formatVoucher(emailModal.invoice)} -{" "}
                  {emailModal.invoice?.cliente_nombre}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeEmailModal}
                disabled={emailModal.sending}
              >
                &times;
              </button>
            </div>

            <label>
              Correo de destino
              <input
                type="email"
                value={emailModal.email}
                onChange={(event) =>
                  setEmailModal((prev) => ({
                    ...prev,
                    email: event.target.value,
                    error: "",
                  }))
                }
                placeholder="paciente@mail.com"
                autoFocus
                disabled={emailModal.sending}
                required
              />
            </label>

            {emailModal.error && (
              <div className="email-modal-error">{emailModal.error}</div>
            )}

            <div className="email-modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeEmailModal}
                disabled={emailModal.sending}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="btn-primary"
                disabled={emailModal.sending}
              >
                {emailModal.sending ? "Enviando..." : "Enviar factura"}
              </button>
            </div>
          </form>
        </div>
      )}
      <OperationOverlay operation={operation} onClose={clearOperation} />
    </div>
  );
}
