import { useEffect, useState } from "react";
import { emitArcaInvoice, listArcaInvoices } from "../services/arcaInvoices";

const INITIAL_FORM = {
  cliente_nombre: "",
  cliente_documento: "0",
  cliente_iva: "Consumidor Final",
  domicilio: "",
  concepto: "Servicios médicos",
  descripcion: "Prestación médica CEDIM",
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

  const [emitting, setEmitting] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [message, setMessage] = useState("");

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
    loadInvoices();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function calcularTotalDesdeNeto() {
    const neto = Number(form.importe_neto || 0);
    const iva = Number(form.importe_iva || 0);
    const total = neto + iva;

    setForm((prev) => ({
      ...prev,
      importe_total: total.toFixed(2),
    }));
  }

  function validarFormulario() {
    if (!form.cliente_nombre.trim()) {
      throw new Error("Falta el nombre del cliente.");
    }

    if (!form.cliente_documento.trim()) {
      throw new Error("Falta el DNI/CUIT del cliente.");
    }

    if (!form.concepto.trim()) {
      throw new Error("Falta el concepto de facturación.");
    }

    if (!Number(form.importe_total || 0) || Number(form.importe_total || 0) <= 0) {
      throw new Error("El total debe ser mayor a cero.");
    }
  }

  function buildPayload() {
    validarFormulario();

    return {
      cliente_nombre: form.cliente_nombre.trim(),
      cliente_documento: form.cliente_documento.trim(),
      cliente_iva: form.cliente_iva,
      domicilio: form.domicilio.trim(),
      concepto: form.concepto.trim(),
      descripcion: form.descripcion.trim(),
      importe_neto: Number(form.importe_neto || 0),
      importe_iva: Number(form.importe_iva || 0),
      importe_total: Number(form.importe_total || 0),
      tipo_comprobante: Number(form.tipo_comprobante || 6),
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

      setMessage(
        `Factura emitida correctamente. Comprobante ${formatVoucher(
          invoice
        )}. CAE: ${invoice.cae || "-"}`
      );

      setForm(INITIAL_FORM);
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
    setMessage("");
  }

  return (
    <div className="page facturacion-page">
      <div className="page-header">
        <div>
          <h1>Facturación</h1>
          <p>
            Emisión de comprobantes ARCA/AFIP desde CEDIM mediante Afip SDK.
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
            Cargá los datos fiscales y emití el comprobante mediante Afip SDK.
            En esta primera etapa se recomienda probar con Factura B,
            consumidor final y ambiente de desarrollo.
          </p>

          <form className="form-grid" onSubmit={handleEmitirFacturaArca}>
            <label>
              Cliente / Razón social
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
              Condición IVA
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
              Descripción
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
          <h2>Configuración actual</h2>

          <div className="draft-summary">
            <p>
              <strong>Proveedor:</strong> Afip SDK
            </p>
            <p>
              <strong>Modo recomendado:</strong> Desarrollo / Homologación
            </p>
            <p>
              <strong>Comprobante inicial:</strong> Factura B
            </p>
            <p>
              <strong>Punto de venta:</strong> {form.punto_venta || "1"}
            </p>
            <p>
              <strong>Estado:</strong> Integración directa, sin extensión Chrome
            </p>
          </div>

          <div className="extension-help">
            <h3>Prueba sugerida</h3>
            <ol>
              <li>Cliente: Consumidor Final.</li>
              <li>Documento: 0.</li>
              <li>Tipo: Factura B.</li>
              <li>Total: 1000.</li>
              <li>IVA: 0 para primera prueba.</li>
            </ol>
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
            <p>Últimos comprobantes registrados desde CEDIM.</p>
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
          <p className="muted">Todavía no hay facturas registradas.</p>
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