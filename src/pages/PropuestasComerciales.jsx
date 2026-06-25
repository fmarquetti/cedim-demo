import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Eye, FileText, RefreshCcw, RotateCcw, ShieldAlert } from "lucide-react";
import { systemModulesCatalog, getModulesByGroup, getProposalModulesDefault } from "../data/systemModulesCatalog";
import { canAccessInternalTools } from "../utils/internalAccess";
import { generarPropuestaPdf } from "../utils/propuestaPdf";

const cedimContext =
  "Teniendo en cuenta que el balance actual cierra el 30 de junio, se propone utilizar el periodo previo para revisar la demo funcional, validar el circuito contable junto con el contador y dejar el sistema preparado para comenzar a operar desde el 1 de julio.";

const defaultOpcionales = [
  "Presentacion automatica de IVA Digital.",
  "Exportacion oficial directa a aplicativos fiscales de ARCA.",
  "Importacion automatica desde Mis Comprobantes.",
  "Liquidacion automatica de retenciones/percepciones por regimen especifico.",
  "Calculo automatico por padron fiscal o jurisdiccion.",
  "Presentacion automatica de declaraciones juradas.",
  "Integraciones provinciales especificas.",
  "Certificados de retencion automaticos.",
  "Ajuste por inflacion contable.",
  "Estados contables legales certificados.",
].join("\n");

const defaultForm = {
  cliente: "",
  titulo: "",
  subtitulo: "",
  fecha: new Date().toISOString().slice(0, 10),
  preparadoPor: "Marquetti & Asociados",
  urlDemo: "",
  usuarioDemo: "",
  passwordDemo: "",
  inicioSugerido: "",
  contexto: "Implementacion de una plataforma administrativo-contable web para centralizar operaciones, registros fiscales, cuentas corrientes y reportes.",
  funcionamientoGeneral:
    "El sistema conecta operaciones administrativas con contabilidad. Cada carga operativa puede impactar automaticamente en IVA, cuentas corrientes, bancos, libro diario, mayor, balance y paneles de control.",
  valorMensual: "",
  revision: "",
  incluyeMantenimiento:
    "Base de datos, hosting, mantenimiento general, soporte operativo, correccion de errores, actualizaciones menores, backups y acompanamiento inicial.",
  opcionalesNoIncluido: defaultOpcionales,
};

function splitLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolvePublicPath(assetPath) {
  if (!assetPath || assetPath === "missing") return assetPath;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${String(assetPath).replace(/^\//, "")}`;
}

function Field({ label, children, full = false }) {
  return (
    <label className={full ? "full" : ""}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextInput({ form, setForm, name, type = "text" }) {
  return <input type={type} value={form[name]} onChange={(event) => setForm((prev) => ({ ...prev, [name]: event.target.value }))} />;
}

function TextArea({ form, setForm, name, rows = 4 }) {
  return <textarea rows={rows} value={form[name]} onChange={(event) => setForm((prev) => ({ ...prev, [name]: event.target.value }))} />;
}

function ModuleSelector({ selectedIds, setSelectedIds }) {
  const selectedSet = new Set(selectedIds);

  function toggleModule(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function moveModule(id, direction) {
    setSelectedIds((prev) => {
      const index = prev.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="proposal-module-selector">
      {systemModulesCatalog.map((module) => {
        const active = selectedSet.has(module.id);
        return (
          <div className={`proposal-module-row ${active ? "active" : ""}`} key={module.id}>
            <label>
              <input type="checkbox" checked={active} onChange={() => toggleModule(module.id)} />
              <span>
                <strong>{module.title}</strong>
                <small>{module.group}</small>
              </span>
            </label>
            {active && (
              <div className="proposal-module-order">
                <button type="button" onClick={() => moveModule(module.id, -1)} title="Subir modulo">
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => moveModule(module.id, 1)} title="Bajar modulo">
                  <ArrowDown size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModulePreview({ module, manifest }) {
  const screenshot = manifest?.screenshots?.[module.screenshotKey];
  const screenshotSrc = resolvePublicPath(screenshot);
  const isMissing = !screenshotSrc || screenshotSrc === "missing";

  return (
    <article className="proposal-module-preview">
      <div className="proposal-module-preview-copy">
        <span>{module.group}</span>
        <h4>{module.title}</h4>
        <p>{module.shortDescription}</p>
        <strong>Valor para el negocio</strong>
        <p>{module.businessValue}</p>
        <strong>Funcionalidades</strong>
        <ul>{module.features.map((item) => <li key={item}>{item}</li>)}</ul>
        <strong>Flujo de trabajo</strong>
        <ul>{module.workflow.map((item) => <li key={item}>{item}</li>)}</ul>
        <strong>Integraciones</strong>
        <p>{module.integrations.join(" ")}</p>
      </div>
      <div className="proposal-screenshot-frame">
        {isMissing ? <span>Captura pendiente. Ejecutar npm run capture:proposal.</span> : <img src={screenshotSrc} alt={`Captura ${module.title}`} />}
      </div>
    </article>
  );
}

export default function PropuestasComerciales({ currentUser }) {
  const [form, setForm] = useState(defaultForm);
  const [selectedIds, setSelectedIds] = useState(getProposalModulesDefault);
  const [manifest, setManifest] = useState(null);
  const [notice, setNotice] = useState("");
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    fetch(resolvePublicPath("proposal-screenshots/manifest.json"), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setManifest(data))
      .catch(() => setManifest(null));
  }, []);

  const selectedModules = useMemo(
    () => selectedIds.map((id) => systemModulesCatalog.find((module) => module.id === id)).filter(Boolean),
    [selectedIds],
  );
  const modulesByGroup = useMemo(() => getModulesByGroup(selectedModules), [selectedModules]);

  if (!canAccessInternalTools(currentUser)) {
    return (
      <section className="page commercial-proposals-page">
        <div className="restricted-card">
          <ShieldAlert size={28} />
          <h2>Acceso restringido</h2>
          <p>Esta herramienta esta disponible solo para administracion interna.</p>
        </div>
      </section>
    );
  }

  function loadCedimProposal() {
    setSelectedIds(getProposalModulesDefault());
    setForm((prev) => ({
      ...prev,
      cliente: "CEDIM",
      titulo: "Propuesta Comercial - Plataforma Contable CEDIM",
      subtitulo: "Sistema administrativo-contable web con facturacion ARCA/AFIP opcional",
      preparadoPor: "Marquetti & Asociados",
      valorMensual: "Equivalente en pesos argentinos a USD 150 mensuales",
      revision: "Revision trimestral",
      usuarioDemo: "user@mail.com",
      urlDemo: "[completar]",
      passwordDemo: "[completar]",
      inicioSugerido: "01/07",
      contexto: cedimContext,
      incluyeMantenimiento:
        "Base de datos, hosting, mantenimiento general, soporte operativo, correccion de errores, actualizaciones menores, backups y acompanamiento inicial.",
      opcionalesNoIncluido: defaultOpcionales,
    }));
  }

  async function handleGeneratePdf() {
    await generarPropuestaPdf(form, selectedModules, manifest);
  }

  function clearForm() {
    setForm(defaultForm);
    setSelectedIds(getProposalModulesDefault());
    setNotice("");
  }

  return (
    <section className="page commercial-proposals-page">
      <div className="page-header">
        <div>
          <h2>Propuestas Comerciales</h2>
          <p>Herramienta interna para generar propuestas profesionales con alcance, capturas, integraciones y costo.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={loadCedimProposal}>
            <RefreshCcw size={16} />
            Cargar propuesta CEDIM completa
          </button>
          <button type="button" className="secondary-button" onClick={() => setNotice("Para actualizar capturas ejecutar npm run capture:proposal")}>
            <RotateCcw size={16} />
            Actualizar capturas
          </button>
          <button type="button" className="secondary-button" onClick={() => setShowPreview((prev) => !prev)}>
            <Eye size={16} />
            Vista previa
          </button>
          <button type="button" className="primary-button" onClick={handleGeneratePdf}>
            <Download size={16} />
            Generar PDF
          </button>
          <button type="button" className="secondary-button" onClick={clearForm}>
            Limpiar
          </button>
        </div>
      </div>

      {notice && <div className="inline-notice">{notice}</div>}

      <div className="proposal-workspace">
        <form className="proposal-form">
          <section className="proposal-form-section">
            <h3>Datos comerciales</h3>
            <div className="proposal-form-grid">
              <Field label="Cliente"><TextInput form={form} setForm={setForm} name="cliente" /></Field>
              <Field label="Fecha"><TextInput form={form} setForm={setForm} name="fecha" type="date" /></Field>
              <Field label="Titulo" full><TextInput form={form} setForm={setForm} name="titulo" /></Field>
              <Field label="Subtitulo" full><TextInput form={form} setForm={setForm} name="subtitulo" /></Field>
              <Field label="Preparado por"><TextInput form={form} setForm={setForm} name="preparadoPor" /></Field>
              <Field label="Inicio sugerido"><TextInput form={form} setForm={setForm} name="inicioSugerido" /></Field>
              <Field label="URL demo" full><TextInput form={form} setForm={setForm} name="urlDemo" /></Field>
              <Field label="Usuario demo"><TextInput form={form} setForm={setForm} name="usuarioDemo" /></Field>
              <Field label="Contrasena demo"><TextInput form={form} setForm={setForm} name="passwordDemo" /></Field>
            </div>
          </section>

          <section className="proposal-form-section">
            <h3>Texto general</h3>
            <div className="proposal-form-grid">
              <Field label="Contexto" full><TextArea form={form} setForm={setForm} name="contexto" rows={5} /></Field>
              <Field label="Funcionamiento general" full><TextArea form={form} setForm={setForm} name="funcionamientoGeneral" rows={5} /></Field>
              <Field label="Valor mensual" full><TextInput form={form} setForm={setForm} name="valorMensual" /></Field>
              <Field label="Revision"><TextInput form={form} setForm={setForm} name="revision" /></Field>
              <Field label="Incluye mantenimiento" full><TextArea form={form} setForm={setForm} name="incluyeMantenimiento" rows={4} /></Field>
              <Field label="Opcionales / no incluido" full><TextArea form={form} setForm={setForm} name="opcionalesNoIncluido" rows={8} /></Field>
            </div>
          </section>

          <section className="proposal-form-section">
            <h3>Modulos incluidos ({selectedModules.length})</h3>
            <ModuleSelector selectedIds={selectedIds} setSelectedIds={setSelectedIds} />
          </section>
        </form>

        {showPreview && (
          <aside className="proposal-preview">
            <div className="proposal-preview-header">
              <div>
                <span>Propuesta interna</span>
                <strong>{form.cliente || "Cliente"}</strong>
              </div>
              <FileText size={22} />
            </div>

            <article className="proposal-preview-page">
              <div className="proposal-preview-page-top">
                <span>Portada</span>
                <span>Marquetti & Asociados</span>
              </div>
              <h2>{form.titulo || "Propuesta Comercial"}</h2>
              <p>{form.subtitulo}</p>
              <div className="proposal-preview-badges">
                <span>{form.cliente || "Cliente"}</span>
                <span>{form.fecha}</span>
                <span>Demo disponible</span>
              </div>
              <div className="preview-card">{form.contexto}</div>
            </article>

            <article className="proposal-preview-page">
              <h3>Funcionamiento general</h3>
              <div className="preview-card wide">{form.funcionamientoGeneral}</div>
              <ul>
                <li>Factura - IVA - CC cliente - asiento</li>
                <li>Egreso - IVA Compras - proveedor - asiento</li>
                <li>Orden de pago - pago - asiento - auditoria</li>
                <li>Banco - conciliacion - asiento</li>
              </ul>
            </article>

            {Object.entries(modulesByGroup).map(([group, modules]) => (
              <article className="proposal-preview-page" key={group}>
                <h3>{group}</h3>
                {modules.map((module) => <ModulePreview key={module.id} module={module} manifest={manifest} />)}
              </article>
            ))}

            <article className="proposal-preview-page">
              <h3>Opcionales y costo</h3>
              <ul>{splitLines(form.opcionalesNoIncluido).map((item) => <li key={item}>{item}</li>)}</ul>
              <div className="preview-price">
                <span>Valor mensual</span>
                <strong>{form.valorMensual || "A definir"}</strong>
                <small>{form.revision}</small>
              </div>
              <div className="preview-card wide">{form.incluyeMantenimiento}</div>
            </article>
          </aside>
        )}
      </div>
    </section>
  );
}
