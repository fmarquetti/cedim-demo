import { useEffect, useState } from "react";
import {
  emitArcaInvoice,
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
};

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

function formatVoucher(invoice) {
  if (!invoice?.punto_venta || !invoice?.numero_comprobante) return "-";

  const puntoVenta = String(invoice.punto_venta).padStart(4, "0");
  const numero = String(invoice.numero_comprobante).padStart(8, "0");

  return `${puntoVenta}-${numero}`;
}

function getVoucherLetter(tipoComprobante) {
  const labels = {
    1: "A",
    6: "B",
    11: "C",
  };

  return labels[Number(tipoComprobante)] || "B";
}

function isTipoC(tipoComprobante) {
  return Number(tipoComprobante) === 11;
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

export default function Facturacion() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [invoices, setInvoices] = useState([]);
  const [lastIssuedInvoice, setLastIssuedInvoice] = useState(null);

  const [emitting, setEmitting] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [pdfActionLoading, setPdfActionLoading] = useState("");

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInvoices();
  }, []);

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

      if (name === "importe_neto" && isTipoC(next.tipo_comprobante)) {
        next.importe_iva = "0";
        next.importe_total = value;
      }

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
    };
  }

  async function handleEmitirFacturaArca(event) {
    event.preventDefault();

    setEmitting(true);
    setMessage("");

    try {
      const payload = buildPayload();
      const invoice = await emitArcaInvoice(payload);
      setLastIssuedInvoice(invoice);

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
      setMessage(error.message || "No se pudo emitir la factura ARCA.");
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

    if (invoice.pdf_url) {
      return invoice.pdf_url;
    }

    return getArcaInvoicePdfUrl(invoice.id);
  }

  async function handleOpenPdf() {
    try {
      setPdfActionLoading("open");
      const pdfUrl = await resolvePdfUrl(lastIssuedInvoice);
      window.open(pdfUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error.message || "No se pudo abrir el PDF.");
    } finally {
      setPdfActionLoading("");
    }
  }

  async function handleDownloadPdf() {
    try {
      setPdfActionLoading("download");
      const pdfUrl = await resolvePdfUrl(lastIssuedInvoice);
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `factura-${formatVoucher(lastIssuedInvoice)}.pdf`;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setMessage(error.message || "No se pudo descargar el PDF.");
    } finally {
      setPdfActionLoading("");
    }
  }

  async function handleSendEmail() {
    const email = window.prompt("Mail de destino");

    if (!email) return;

    try {
      setPdfActionLoading("email");
      const updatedInvoice = await sendArcaInvoiceEmail(
        lastIssuedInvoice.id,
        email.trim(),
      );
      setLastIssuedInvoice(updatedInvoice || lastIssuedInvoice);
      setMessage(`Factura enviada por mail a ${email.trim()}.`);
      await loadInvoices();
    } catch (error) {
      setMessage(error.message || "No se pudo enviar la factura por mail.");
    } finally {
      setPdfActionLoading("");
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
                <option value="1">Factura A</option>
                <option value="11">Factura C</option>
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
                <span>Comprobante emitido electronicamente</span>
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
            {lastIssuedInvoice?.pdf_url ? (
              <span>PDF disponible</span>
            ) : (
              <span>PDF pendiente</span>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={handleDownloadPdf}
              disabled={!lastIssuedInvoice?.pdf_url || Boolean(pdfActionLoading)}
            >
              {pdfActionLoading === "download" ? "Descargando..." : "Descargar PDF"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleOpenPdf}
              disabled={!lastIssuedInvoice?.pdf_url || Boolean(pdfActionLoading)}
            >
              {pdfActionLoading === "open" ? "Abriendo..." : "Abrir PDF"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSendEmail}
              disabled={!lastIssuedInvoice?.pdf_url || Boolean(pdfActionLoading)}
            >
              {pdfActionLoading === "email" ? "Enviando..." : "Compartir por mail"}
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
          <div className="table-card" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Comprobante</th>
                  <th>Total</th>
                  <th>CAE</th>
                  <th>Vto. CAE</th>
                  <th>PDF</th>
                  <th>Estado</th>
                  <th>Error</th>
                </tr>
              </thead>

              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{formatDate(invoice.created_at)}</td>
                    <td>{invoice.cliente_nombre}</td>
                    <td>{invoice.cliente_documento}</td>
                    <td>{formatVoucher(invoice)}</td>
                    <td>{formatCurrency(invoice.importe_total)}</td>
                    <td>{invoice.cae || "-"}</td>
                    <td>{invoice.cae_vencimiento || "-"}</td>
                    <td>{invoice.pdf_url ? "Disponible" : "Pendiente"}</td>
                    <td>
                      <span className={`status-badge ${invoice.estado}`}>
                        {getEstadoLabel(invoice.estado)}
                      </span>
                    </td>
                    <td>{invoice.error_message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
