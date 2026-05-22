import { useMemo, useState } from "react";
import { CheckCircle, Download, FileUp, Upload, XCircle } from "lucide-react";

import { downloadTemplate, readCsvFile, readExcelFile } from "../utils/importUtils";
import {
  importarEgresos,
  importarEntidades,
  importarMovimientosBancarios,
  importarPlanCuentas,
  importarSaldosIniciales,
  validarImportacionEgresos,
  validarImportacionEntidades,
  validarImportacionMovimientosBancarios,
  validarImportacionPlanCuentas,
  validarImportacionSaldosIniciales,
} from "../services/importacionService";
import { formatMoney } from "../utils/format";

const TIPOS = {
  saldos: "Saldos Iniciales",
  egresos: "Egresos / Compras",
  bancos: "Movimientos Bancarios",
  entidades: "Clientes / Proveedores",
  plan: "Plan de Cuentas",
};

const templates = {
  saldos: [
    { fecha_apertura: "2026-01-01", cuenta_codigo: "1.1.01", descripcion: "Caja inicial", debe: 100000, haber: 0 },
    { fecha_apertura: "2026-01-01", cuenta_codigo: "3.1.01", descripcion: "Capital inicial", debe: 0, haber: 100000 },
  ],
  egresos: [
    {
      fecha: "2026-01-15",
      proveedor: "Proveedor Demo",
      sociedad: "CEDIM",
      concepto: "Compra insumos",
      categoria: "Compras",
      importe: 121000,
      estado: "Pendiente",
      comprobante: "FC 0001-00000001",
      factura_cuit: "30123456789",
      factura_tipo: "1",
      factura_punto_venta: "1",
      factura_numero: "1",
      neto_gravado: 100000,
      iva: 21000,
      exento: 0,
      no_gravado: 0,
      percepcion_iva: 0,
      percepcion_iibb: 2000,
      retencion_ganancias: 1000,
      retencion_iva: 0,
      retencion_iibb: 0,
      otros_tributos: 0,
    },
  ],
  bancos: [
    {
      fecha: "2026-01-20",
      cuenta: "Banco Nacion",
      tipo: "Ingreso",
      descripcion: "Transferencia recibida",
      importe: 50000,
      origen: "Importacion bancaria",
      estado: "Pendiente",
      external_hash: "demo-001",
    },
  ],
  entidades: [
    {
      tipo: "cliente",
      nombre: "Cliente Demo",
      documento: "20123456789",
      condicion_iva: "Responsable Inscripto",
      email: "cliente@mail.com",
      telefono: "2610000000",
      domicilio: "Mendoza",
    },
  ],
  plan: [
    { codigo: "1.1.05", nombre: "Mercado Pago", tipo: "ACTIVO", subtipo: "Disponibilidades", imputable: true, activa: true },
  ],
};

export default function Importaciones({ sedeId }) {
  const [tipo, setTipo] = useState("saldos");
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);

  const previewRows = useMemo(() => rows.slice(0, 20), [rows]);
  const canImport = validation?.valid && rows.length > 0;

  const resetData = () => {
    setHeaders([]);
    setRows([]);
    setValidation(null);
    setResult(null);
    setError("");
  };

  const handleDownloadTemplate = async () => {
    setError("");
    await downloadTemplate(`Plantilla_${TIPOS[tipo].replace(/\s|\/+/g, "_")}.xlsx`, templates[tipo]);
  };

  const handleReadFile = async () => {
    if (!file) {
      setError("Selecciona un archivo Excel o CSV.");
      return;
    }

    setLoadingFile(true);
    resetData();
    try {
      const lower = file.name.toLowerCase();
      const data = lower.endsWith(".csv") ? await readCsvFile(file) : await readExcelFile(file);
      setHeaders(data.headers || []);
      setRows(data.rows || []);
    } catch (err) {
      setError(err.message || "No se pudo leer el archivo.");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setError("");
    setResult(null);

    try {
      const options = { sedeId };
      const validators = {
        saldos: () => validarImportacionSaldosIniciales(rows, options),
        egresos: () => validarImportacionEgresos(rows, options),
        bancos: () => validarImportacionMovimientosBancarios(rows, options),
        entidades: () => validarImportacionEntidades(rows),
        plan: () => validarImportacionPlanCuentas(rows),
      };
      setValidation(await validators[tipo]());
    } catch (err) {
      setError(err.message || "No se pudo validar el archivo.");
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!canImport) return;
    if (!window.confirm(`Confirmar importacion de ${rows.length} filas de ${TIPOS[tipo]}?`)) return;

    setImporting(true);
    setError("");

    try {
      const options = { sedeId };
      const importers = {
        saldos: () => importarSaldosIniciales(rows, options),
        egresos: () => importarEgresos(rows, options),
        bancos: () => importarMovimientosBancarios(rows, options),
        entidades: () => importarEntidades(rows),
        plan: () => importarPlanCuentas(rows),
      };
      setResult(await importers[tipo]());
    } catch (err) {
      setError(err.detalle ? `${err.message} ${err.detalle.length} errores.` : err.message || "No se pudo importar.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="page">
      <div className="page-header" data-tour="importaciones-header">
        <div>
          <h2>Importaciones</h2>
          <p>Carga masiva de datos desde Excel o CSV.</p>
        </div>
      </div>

      <div className="filters-bar" data-tour="importaciones-tipo">
        <select value={tipo} onChange={(event) => { setTipo(event.target.value); resetData(); setFile(null); }}>
          {Object.entries(TIPOS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>

      <div className="panel" data-tour="importaciones-plantilla">
        <h3>Plantilla</h3>
        <p className="muted">Descarga un archivo de ejemplo con los encabezados esperados para {TIPOS[tipo]}.</p>
        <button type="button" className="secondary-button" onClick={handleDownloadTemplate}>
          <Download size={16} /> Descargar plantilla
        </button>
      </div>

      <div className="panel" data-tour="importaciones-archivo">
        <h3>Archivo</h3>
        <div className="filters-bar">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              resetData();
            }}
          />
          <span className="muted">{file?.name || "Sin archivo seleccionado"}</span>
          <button type="button" className="primary-button" onClick={handleReadFile} disabled={loadingFile || !file}>
            <FileUp size={16} /> {loadingFile ? "Leyendo..." : "Leer archivo"}
          </button>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="panel" data-tour="importaciones-preview">
        <h3>Vista previa</h3>
        <p className="muted">Filas detectadas: {rows.length}. Headers: {headers.join(", ") || "-"}</p>
        <div className="table-card">
          <table>
            <thead>
              <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {previewRows.map((row, index) => (
                <tr key={index}>
                  {headers.map((header) => <td key={header}>{String(row[header] ?? "")}</td>)}
                </tr>
              ))}
              {previewRows.length === 0 && (
                <tr><td colSpan={Math.max(headers.length, 1)}>No hay filas leidas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" data-tour="importaciones-validacion">
        <div className="split-header">
          <div>
            <h3>Validacion</h3>
            <p className="muted">Valida formato, datos requeridos e importes antes de guardar.</p>
          </div>
          <button type="button" className="secondary-button" onClick={handleValidate} disabled={validating || rows.length === 0}>
            <CheckCircle size={16} /> {validating ? "Validando..." : "Validar"}
          </button>
        </div>

        {validation && (
          <>
            <div className="stats-grid small">
              <div className="stat-card">
                <div><span>Estado</span><strong>{validation.valid ? "Valido" : "Con errores"}</strong></div>
                {validation.valid ? <CheckCircle size={22} /> : <XCircle size={22} />}
              </div>
              <div className="stat-card"><div><span>Total filas</span><strong>{validation.resumen?.totalFilas ?? rows.length}</strong></div></div>
              {"totalImporte" in (validation.resumen || {}) && (
                <div className="stat-card"><div><span>Total importe</span><strong>{formatMoney(validation.resumen.totalImporte)}</strong></div></div>
              )}
              {"diferencia" in (validation.resumen || {}) && (
                <div className="stat-card"><div><span>Diferencia</span><strong>{formatMoney(validation.resumen.diferencia)}</strong></div></div>
              )}
            </div>

            {validation.errores.length > 0 && (
              <div className="table-card" style={{ marginTop: 14 }}>
                <table>
                  <thead><tr><th>Fila</th><th>Campo</th><th>Error</th></tr></thead>
                  <tbody>
                    {validation.errores.map((item, index) => (
                      <tr key={index}><td>{item.rowIndex || "-"}</td><td>{item.campo}</td><td>{item.mensaje}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {validation.warnings?.length > 0 && (
              <div className="table-card" style={{ marginTop: 14 }}>
                <table>
                  <thead><tr><th>Fila</th><th>Campo</th><th>Advertencia</th></tr></thead>
                  <tbody>
                    {validation.warnings.map((item, index) => (
                      <tr key={index}><td>{item.rowIndex || "-"}</td><td>{item.campo || "-"}</td><td>{item.mensaje}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel" data-tour="importaciones-resultado">
        <div className="split-header">
          <div>
            <h3>Importacion</h3>
            <p className="muted">Solo se habilita despues de una validacion correcta.</p>
          </div>
          <button type="button" className="primary-button" onClick={handleImport} disabled={!canImport || importing}>
            <Upload size={16} /> {importing ? "Importando..." : "Importar"}
          </button>
        </div>

        {result && (
          <>
            <div className="table-card" style={{ marginTop: 14 }}>
              <table>
                <tbody>
                  <tr><th>Procesados</th><td>{result.procesados ?? result.importados ?? 0}</td></tr>
                  <tr><th>Importados</th><td>{result.importados ?? 0}</td></tr>
                  <tr><th>Fechas</th><td>{result.fechas?.join(", ") || "-"}</td></tr>
                  <tr><th>Errores</th><td>{result.errores?.length || 0}</td></tr>
                </tbody>
              </table>
            </div>

            {result.errores?.length > 0 && (
              <div className="table-card" style={{ marginTop: 14 }}>
                <table>
                  <thead><tr><th>Fila</th><th>Error</th></tr></thead>
                  <tbody>
                    {result.errores.map((item, index) => (
                      <tr key={index}><td>{item.rowIndex || "-"}</td><td>{item.mensaje || item.campo || "Error"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
