import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  ImageUp,
  Palette,
  RotateCcw,
  Save,
  Settings,
  Upload,
} from "lucide-react";

import { defaultAppConfig } from "../services/configuracionService";
import { useAppConfig } from "../context/AppConfigContext";
import { uploadConfigIcon } from "../services/configAssetService";
import {
  getArcaSettings,
  updateArcaSettings,
} from "../services/arcaInvoices";
import { canPerform } from "../utils/permissions";

const menuOptions = [
  { id: "dashboard", label: "Dashboard" },
  { id: "ingresos", label: "Ingresos" },
  { id: "egresos", label: "Egresos" },
  { id: "cuentas", label: "Cuentas corrientes" },
  { id: "bancos", label: "Bancos" },
  { id: "reportes", label: "Reportes" },
  { id: "documentos", label: "Documentos" },
  { id: "pacientes", label: "Pacientes y estudios" },
  { id: "turnos", label: "Turnos" },
  { id: "sedes", label: "Sociedades / Sedes" },
  { id: "usuarios", label: "Usuarios" },
  { id: "configuracion", label: "Configuración" },
];

const defaultArcaSettingsForm = {
  emisor_nombre: "",
  emisor_cuit: "",
  emisor_domicilio: "",
  emisor_iva: "",
  punto_venta_default: "1",
  tipo_comprobante_default: "6",
  email_from_name: "",
  email_from_address: "",
  pdf_leyenda: "",
  pdf_footer: "",
  arca_environment: "dev",
};

function isAdminUser(currentUser) {
  const role = String(
    currentUser?.rol ||
      currentUser?.role ||
      currentUser?.perfil ||
      "",
  ).toLowerCase();

  const email = String(currentUser?.email || "").toLowerCase();

  return (
    role.includes("admin") ||
    role.includes("administrador") ||
    email === "francomarquetti@gmail.com"
  );
}

function buildArcaSettingsForm(settings = null) {
  return {
    ...defaultArcaSettingsForm,
    ...Object.fromEntries(
      Object.entries(settings || {}).map(([key, value]) => [
        key,
        value === null || value === undefined ? "" : String(value),
      ]),
    ),
    punto_venta_default: String(settings?.punto_venta_default || "1"),
    tipo_comprobante_default: String(settings?.tipo_comprobante_default || "6"),
    arca_environment: settings?.arca_environment || "dev",
  };
}

export default function Configuracion({ currentUser }) {
  const {
    config,
    setConfig,
    updateConfig,
    refreshConfig,
    savingConfig,
    loadingConfig,
  } = useAppConfig();

  const [form, setForm] = useState(config);
  const [activeTab, setActiveTab] = useState("marca");
  const [uploading, setUploading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [arcaSettings, setArcaSettings] = useState(null);
  const [arcaSettingsForm, setArcaSettingsForm] = useState(
    buildArcaSettingsForm(),
  );
  const [loadingArcaSettings, setLoadingArcaSettings] = useState(false);
  const [savingArcaSettings, setSavingArcaSettings] = useState(false);
  const userIsAdmin = isAdminUser(currentUser);
  const canEditConfiguracion = canPerform(currentUser, "configuracion", "edit");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(config);
  }, [config]);

  useEffect(() => {
    if (!userIsAdmin) return;

    let cancelled = false;

    async function loadArcaSettings() {
      setLoadingArcaSettings(true);
      setError("");

      try {
        const settings = await getArcaSettings();

        if (cancelled) return;

        setArcaSettings(settings);
        setArcaSettingsForm(buildArcaSettingsForm(settings));
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message || "No se pudo cargar la configuracion de facturacion.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingArcaSettings(false);
        }
      }
    }

    loadArcaSettings();

    return () => {
      cancelled = true;
    };
  }, [userIsAdmin]);

  const hiddenCount = useMemo(() => {
    return Array.isArray(form.hiddenMenuItems) ? form.hiddenMenuItems.length : 0;
  }, [form.hiddenMenuItems]);

  function updateField(field, value) {
    if (!canEditConfiguracion) return;

    const next = {
      ...form,
      [field]: value,
    };

    setForm(next);

    if (
      field === "primaryColor" ||
      field === "secondaryColor" ||
      field === "accentColor"
    ) {
      setConfig(next);
    }
  }

  function updateArcaSettingsField(field, value) {
    if (!canEditConfiguracion) return;

    setArcaSettingsForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function isMenuHidden(id) {
    return form.hiddenMenuItems?.includes(id);
  }

  function toggleMenuItem(id) {
    if (!canEditConfiguracion) return;
    if (id === "configuracion") return;

    const current = Array.isArray(form.hiddenMenuItems)
      ? form.hiddenMenuItems
      : [];

    const nextHidden = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];

    updateField("hiddenMenuItems", nextHidden);
  }

  async function handleIconUpload(e, field, folder) {
    if (!canEditConfiguracion) return;

    const file = e.target.files?.[0];

    if (!file) return;

    setUploading(field);
    setMessage("");
    setError("");

    try {
      const uploaded = await uploadConfigIcon(file, folder);
      updateField(field, uploaded.publicUrl);
      setMessage("Icono cargado correctamente. Presioná Guardar cambios para aplicar la configuración.");
    } catch (err) {
      setError(err.message || "No se pudo cargar el icono.");
    } finally {
      setUploading("");
      e.target.value = "";
    }
  }

  function restoreDefaults() {
    if (!canEditConfiguracion) return;

    setForm(defaultAppConfig);
    setConfig(defaultAppConfig);
    setMessage("");
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canEditConfiguracion) return;

    setMessage("");
    setError("");

    try {
      await updateConfig(form);
      setMessage("Configuración guardada correctamente.");
    } catch (err) {
      setError(err.message || "No se pudo guardar la configuración.");
    }
  }

  async function handleReload() {
    setMessage("");
    setError("");

    try {
      await refreshConfig();
      setMessage("Configuración recargada desde Supabase.");
    } catch {
      setError("No se pudo recargar la configuración.");
    }
  }

  async function handleSaveArcaSettings() {
    if (!canEditConfiguracion || !userIsAdmin) return;

    setMessage("");
    setError("");
    setSavingArcaSettings(true);

    try {
      const saved = await updateArcaSettings({
        emisor_nombre: arcaSettingsForm.emisor_nombre.trim() || null,
        emisor_cuit: arcaSettingsForm.emisor_cuit.trim() || null,
        emisor_domicilio: arcaSettingsForm.emisor_domicilio.trim() || null,
        emisor_iva: arcaSettingsForm.emisor_iva.trim() || null,
        punto_venta_default: Number(arcaSettingsForm.punto_venta_default || 1),
        tipo_comprobante_default: Number(
          arcaSettingsForm.tipo_comprobante_default || 6,
        ),
        email_from_name: arcaSettingsForm.email_from_name.trim() || null,
        email_from_address: arcaSettingsForm.email_from_address.trim() || null,
        pdf_leyenda: arcaSettingsForm.pdf_leyenda.trim() || null,
        pdf_footer: arcaSettingsForm.pdf_footer.trim() || null,
        arca_environment: arcaSettingsForm.arca_environment || "dev",
      });

      setArcaSettings(saved);
      setArcaSettingsForm(buildArcaSettingsForm(saved));
      setMessage("Configuracion de facturacion guardada correctamente.");
    } catch (err) {
      setError(
        err.message || "No se pudo guardar la configuracion de facturacion.",
      );
    } finally {
      setSavingArcaSettings(false);
    }
  }

  if (loadingConfig) {
    return (
      <section className="page">
        <div className="dashboard-loader">
          <Settings className="dashboard-loader-icon" size={28} />
          <h3>Cargando configuración</h3>
          <p>Obteniendo parámetros generales de la plataforma.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Configuración</h2>
          <p>
            Personalización general de marca, login, footer, colores, menú
            lateral y avisos globales.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handleReload}
            disabled={savingConfig || uploading}
          >
            <RotateCcw size={16} />
            Recargar
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={restoreDefaults}
            disabled={!canEditConfiguracion || savingConfig || uploading}
          >
            <RotateCcw size={16} />
            Restaurar
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={!canEditConfiguracion || savingConfig || uploading}
          >
            <Save size={16} />
            {savingConfig ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>

      {(message || error) && (
        <div className={`config-message ${error ? "error" : "success"}`}>
          {error || message}
        </div>
      )}

      {!canEditConfiguracion && (
        <div className="config-message">
          Tenes acceso de lectura. Para modificar esta configuracion necesitas configuracion.edit.
        </div>
      )}

      <div className="config-layout">
        <aside className="config-tabs">
          <button
            type="button"
            className={activeTab === "marca" ? "active" : ""}
            onClick={() => setActiveTab("marca")}
          >
            <ImageUp size={17} />
            Marca
          </button>

          <button
            type="button"
            className={activeTab === "colores" ? "active" : ""}
            onClick={() => setActiveTab("colores")}
          >
            <Palette size={17} />
            Colores
          </button>

          <button
            type="button"
            className={activeTab === "menu" ? "active" : ""}
            onClick={() => setActiveTab("menu")}
          >
            <Eye size={17} />
            Sidebar
          </button>

          <button
            type="button"
            className={activeTab === "avisos" ? "active" : ""}
            onClick={() => setActiveTab("avisos")}
          >
            <Settings size={17} />
            Avisos y footer
          </button>

          {userIsAdmin && (
            <button
              type="button"
              className={activeTab === "facturacion" ? "active" : ""}
              onClick={() => setActiveTab("facturacion")}
            >
              <Settings size={17} />
              Facturación
            </button>
          )}
        </aside>

        <form className="config-grid" onSubmit={handleSubmit}>
          {activeTab === "marca" && (
            <>
              <section className="config-panel">
                <h3>Marca de la plataforma</h3>
                <p>
                  Define el nombre visible, subtítulo e icono principal del
                  sistema.
                </p>

                <div className="config-form-grid">
                  <label>
                    Nombre de la plataforma
                    <input
                      value={form.platformName || ""}
                      onChange={(e) =>
                        updateField("platformName", e.target.value)
                      }
                      placeholder="CEDIM"
                    />
                  </label>

                  <label>
                    Subtítulo / descripción
                    <input
                      value={form.platformSubtitle || ""}
                      onChange={(e) =>
                        updateField("platformSubtitle", e.target.value)
                      }
                      placeholder="Laboratorio clínico"
                    />
                  </label>

                  <div className="config-upload-card full">
                    <div className="config-preview-card">
                      {form.platformIconUrl ? (
                        <img
                          src={form.platformIconUrl}
                          alt="Icono plataforma"
                        />
                      ) : (
                        <div className="config-preview-icon">
                          <Upload size={20} />
                        </div>
                      )}

                      <div>
                        <strong>
                          {form.platformName || "Nombre de plataforma"}
                        </strong>
                        <span>
                          {form.platformSubtitle || "Subtítulo de plataforma"}
                        </span>
                      </div>
                    </div>

                    <label className="file-upload-button">
                      <ImageUp size={16} />
                      {uploading === "platformIconUrl"
                        ? "Subiendo..."
                        : "Cargar icono de plataforma"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                        onChange={(e) =>
                          handleIconUpload(
                            e,
                            "platformIconUrl",
                            "platform-icons"
                          )
                        }
                        disabled={!canEditConfiguracion || Boolean(uploading)}
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="config-panel">
                <h3>Pantalla de login</h3>
                <p>
                  Cambia el título, descripción e icono que se muestran antes de
                  iniciar sesión.
                </p>

                <div className="config-form-grid">
                  <label>
                    Nombre en login
                    <input
                      value={form.loginTitle || ""}
                      onChange={(e) =>
                        updateField("loginTitle", e.target.value)
                      }
                      placeholder="CEDIM"
                    />
                  </label>

                  <label>
                    Texto descriptivo de login
                    <input
                      value={form.loginSubtitle || ""}
                      onChange={(e) =>
                        updateField("loginSubtitle", e.target.value)
                      }
                      placeholder="Plataforma de gestión para laboratorio clínico"
                    />
                  </label>

                  <label>
                    Texto inferior del login
                    <input
                      value={form.loginFooterText || ""}
                      onChange={(e) =>
                        updateField("loginFooterText", e.target.value)
                      }
                      placeholder="CEDIM · Versión"
                    />
                  </label>

                  <label>
                    Texto destacado inferior
                    <input
                      value={form.loginFooterHighlight || ""}
                      onChange={(e) =>
                        updateField("loginFooterHighlight", e.target.value)
                      }
                      placeholder="SUPABASE"
                    />
                  </label>

                  <div className="config-upload-card full">
                    <div className="config-preview-card">
                      {form.loginIconUrl || form.platformIconUrl ? (
                        <img
                          src={form.loginIconUrl || form.platformIconUrl}
                          alt="Icono login"
                        />
                      ) : (
                        <div className="config-preview-icon">
                          <Upload size={20} />
                        </div>
                      )}

                      <div>
                        <strong>{form.loginTitle || "Título de login"}</strong>
                        <span>
                          {form.loginSubtitle || "Descripción de login"}
                        </span>
                      </div>
                    </div>

                    <label className="file-upload-button">
                      <ImageUp size={16} />
                      {uploading === "loginIconUrl"
                        ? "Subiendo..."
                        : "Cargar icono de login"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                        onChange={(e) =>
                          handleIconUpload(e, "loginIconUrl", "login-icons")
                        }
                        disabled={!canEditConfiguracion || Boolean(uploading)}
                      />
                    </label>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === "colores" && (
            <section className="config-panel">
              <h3>Colores generales</h3>
              <p>
                Estos colores modifican botones principales, menú activo,
                acentos y detalles visuales generales.
              </p>

              <div className="config-form-grid">
                <label>
                  Color primario
                  <input
                    type="color"
                    value={form.primaryColor || defaultAppConfig.primaryColor}
                    onChange={(e) =>
                      updateField("primaryColor", e.target.value)
                    }
                  />
                </label>

                <label>
                  Color secundario
                  <input
                    type="color"
                    value={
                      form.secondaryColor || defaultAppConfig.secondaryColor
                    }
                    onChange={(e) =>
                      updateField("secondaryColor", e.target.value)
                    }
                  />
                </label>

                <label>
                  Color de acento
                  <input
                    type="color"
                    value={form.accentColor || defaultAppConfig.accentColor}
                    onChange={(e) => updateField("accentColor", e.target.value)}
                  />
                </label>

                <div className="config-color-preview">
                  <span style={{ background: form.primaryColor }} />
                  <span style={{ background: form.secondaryColor }} />
                  <span style={{ background: form.accentColor }} />
                </div>
              </div>

              <div className="config-theme-preview">
                <button type="button" className="primary-button">
                  Botón principal
                </button>

                <button type="button" className="secondary-button">
                  Botón secundario
                </button>

                <div className="config-mini-sidebar">
                  <div className="active">Menú activo</div>
                  <div>Menú normal</div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "menu" && (
            <section className="config-panel">
              <h3>Visibilidad del sidebar</h3>
              <p>
                Oculta módulos completos del menú lateral para todos los
                usuarios. Configuración no puede ocultarse desde esta pantalla.
              </p>

              <div className="config-summary">
                <strong>{hiddenCount}</strong>
                <span>módulos ocultos globalmente</span>
              </div>

              <div className="menu-visibility-grid">
                {menuOptions.map((item) => {
                  const hidden = isMenuHidden(item.id);
                  const locked = item.id === "configuracion";

                  return (
                    <div
                      key={item.id}
                      className={`menu-visibility-item ${locked ? "locked" : ""
                        }`}
                    >
                      <div>
                        <span>{item.label}</span>
                        <small>
                          {locked
                            ? "Siempre visible para administración"
                            : hidden
                              ? "Oculto para todos"
                              : "Visible"}
                        </small>
                      </div>

                      <button
                        type="button"
                        className={`visibility-toggle ${hidden ? "hidden" : ""
                          }`}
                        onClick={() => toggleMenuItem(item.id)}
                        disabled={locked || !canEditConfiguracion}
                        title={hidden ? "Mostrar módulo" : "Ocultar módulo"}
                      >
                        {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === "avisos" && (
            <>
              <section className="config-panel">
                <h3>Footer</h3>
                <p>Texto inferior global de la plataforma.</p>

                <div className="config-form-grid">
                  <label>
                    Texto de footer
                    <input
                      value={form.footerText || ""}
                      onChange={(e) =>
                        updateField("footerText", e.target.value)
                      }
                      placeholder="Creado por Marquetti & Asociados"
                    />
                  </label>

                  <label>
                    Ambiente
                    <input
                      value={form.footerEnvironment || ""}
                      onChange={(e) =>
                        updateField("footerEnvironment", e.target.value)
                      }
                      placeholder="Demo / Producción"
                    />
                  </label>
                </div>
              </section>

              <section className="config-panel">
                <h3>Aviso flotante por falta de pago</h3>
                <p>
                  Permite mostrar un aviso global dentro de la plataforma sin
                  bloquear completamente el uso.
                </p>

                <div className="config-form-grid">
                  <label className="config-switch-row full">
                    <div>
                      <strong>Mostrar aviso flotante</strong>
                      <span>
                        Cuando está activo, todos los usuarios ven el mensaje.
                      </span>
                    </div>

                    <input
                      className="switch-input"
                      type="checkbox"
                      checked={Boolean(form.paymentNoticeEnabled)}
                      onChange={(e) =>
                        updateField("paymentNoticeEnabled", e.target.checked)
                      }
                    />
                  </label>

                  <label className="full">
                    Texto del aviso
                    <textarea
                      value={form.paymentNoticeText || ""}
                      onChange={(e) =>
                        updateField("paymentNoticeText", e.target.value)
                      }
                      placeholder="Mensaje administrativo..."
                    />
                  </label>
                </div>
              </section>
            </>
          )}

          {activeTab === "facturacion" && userIsAdmin && (
            <section className="config-panel">
              <h3>Configuración de facturación</h3>
              <p>
                Parámetros fiscales y visuales usados para emitir comprobantes y
                generar PDF. No se guardan tokens, contraseñas ni claves privadas.
              </p>

              {loadingArcaSettings ? (
                <p>Cargando configuración de facturación...</p>
              ) : (
                <>
                  <div className="config-form-grid billing-settings-grid">
                    <label>
                      Nombre emisor
                      <input
                        value={arcaSettingsForm.emisor_nombre}
                        onChange={(e) =>
                          updateArcaSettingsField(
                            "emisor_nombre",
                            e.target.value,
                          )
                        }
                        placeholder="CEDIM"
                      />
                    </label>

                    <label>
                      CUIT emisor
                      <input
                        value={arcaSettingsForm.emisor_cuit}
                        onChange={(e) =>
                          updateArcaSettingsField("emisor_cuit", e.target.value)
                        }
                        placeholder="CUIT"
                      />
                    </label>

                    <label>
                      Domicilio fiscal
                      <input
                        value={arcaSettingsForm.emisor_domicilio}
                        onChange={(e) =>
                          updateArcaSettingsField(
                            "emisor_domicilio",
                            e.target.value,
                          )
                        }
                        placeholder="Domicilio fiscal"
                      />
                    </label>

                    <label>
                      Condición IVA emisor
                      <input
                        value={arcaSettingsForm.emisor_iva}
                        onChange={(e) =>
                          updateArcaSettingsField("emisor_iva", e.target.value)
                        }
                        placeholder="Responsable Inscripto"
                      />
                    </label>

                    <label>
                      Punto de venta por defecto
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={arcaSettingsForm.punto_venta_default}
                        onChange={(e) =>
                          updateArcaSettingsField(
                            "punto_venta_default",
                            e.target.value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Tipo comprobante por defecto
                      <select
                        value={arcaSettingsForm.tipo_comprobante_default}
                        onChange={(e) =>
                          updateArcaSettingsField(
                            "tipo_comprobante_default",
                            e.target.value,
                          )
                        }
                      >
                        <option value="6">Factura B</option>
                        <option value="11">Factura C</option>
                        <option value="1">Factura A</option>
                        <option value="8">Nota de Credito B</option>
                        <option value="13">Nota de Credito C</option>
                        <option value="3">Nota de Credito A</option>
                        <option value="7">Nota de Debito B</option>
                        <option value="12">Nota de Debito C</option>
                        <option value="2">Nota de Debito A</option>
                      </select>
                    </label>

                    <label>
                      Nombre remitente email
                      <input
                        value={arcaSettingsForm.email_from_name}
                        onChange={(e) =>
                          updateArcaSettingsField(
                            "email_from_name",
                            e.target.value,
                          )
                        }
                        placeholder="CEDIM"
                      />
                    </label>

                    <label>
                      Email remitente
                      <input
                        type="email"
                        value={arcaSettingsForm.email_from_address}
                        onChange={(e) =>
                          updateArcaSettingsField(
                            "email_from_address",
                            e.target.value,
                          )
                        }
                        placeholder="facturacion@cedim.com"
                      />
                    </label>

                    <label className="full">
                      Leyenda PDF
                      <textarea
                        value={arcaSettingsForm.pdf_leyenda}
                        onChange={(e) =>
                          updateArcaSettingsField("pdf_leyenda", e.target.value)
                        }
                        placeholder="Comprobante emitido electrónicamente"
                      />
                    </label>

                    <label className="full">
                      Footer PDF
                      <textarea
                        value={arcaSettingsForm.pdf_footer}
                        onChange={(e) =>
                          updateArcaSettingsField("pdf_footer", e.target.value)
                        }
                        placeholder="Generado desde CEDIM"
                      />
                    </label>

                    <label>
                      Ambiente ARCA
                      <select
                        value={arcaSettingsForm.arca_environment}
                        onChange={(e) =>
                          updateArcaSettingsField(
                            "arca_environment",
                            e.target.value,
                          )
                        }
                      >
                        <option value="dev">Desarrollo / homologación</option>
                        <option value="prod">Producción</option>
                      </select>
                    </label>
                  </div>

                  <div className="billing-settings-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setArcaSettingsForm(buildArcaSettingsForm(arcaSettings))
                      }
                      disabled={!canEditConfiguracion || savingArcaSettings}
                    >
                      Descartar cambios
                    </button>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleSaveArcaSettings}
                      disabled={!canEditConfiguracion || savingArcaSettings}
                    >
                      <Save size={16} />
                      {savingArcaSettings
                        ? "Guardando..."
                        : "Guardar configuración de facturación"}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === "facturacion" && !userIsAdmin && (
            <section className="config-panel">
              <h3>No tenés permisos</h3>
              <p>La configuración de facturación solo está disponible para administradores.</p>
            </section>
          )}

          {activeTab !== "facturacion" && (
          <div className="config-sticky-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={restoreDefaults}
              disabled={!canEditConfiguracion || savingConfig || uploading}
            >
              Restaurar valores por defecto
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={!canEditConfiguracion || savingConfig || uploading}
            >
              <Save size={16} />
              {savingConfig ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>
          )}
        </form>
      </div>
    </section>
  );
}
