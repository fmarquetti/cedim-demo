import { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Save, ToggleLeft, ToggleRight, X } from "lucide-react";
import {
  getEntidadesCuentaCorriente,
  setEntidadCuentaCorrienteActiva,
  upsertEntidadCuentaCorriente,
} from "../services/cuentaCorrienteEntidadService";
import { canPerform } from "../utils/permissions";

const emptyForm = {
  id: null,
  tipo: "cliente",
  nombre: "",
  documento: "",
  condicionIva: "",
  email: "",
  telefono: "",
  domicilio: "",
};

const tipoLabels = {
  cliente: "Cliente",
  proveedor: "Proveedor",
};

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function ClientesProveedores({ currentUser }) {
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("activos");
  const [search, setSearch] = useState("");
  const [entidades, setEntidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const canCreate = canPerform(currentUser, "clientesProveedores", "create");
  const canEdit = canPerform(currentUser, "clientesProveedores", "edit");
  const canManage = canCreate || canEdit;

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const activa = estadoFiltro === "todos" ? undefined : estadoFiltro === "activos";
      const data = await getEntidadesCuentaCorriente({
        tipo: tipoFiltro,
        activa,
      });
      setEntidades(data || []);
    } catch (err) {
      console.error("Error cargando clientes/proveedores:", err);
      setError(err.message || "No se pudieron cargar los clientes y proveedores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [tipoFiltro, estadoFiltro]);

  const entidadesFiltradas = useMemo(() => {
    const term = normalizeSearch(search);
    if (!term) return entidades;

    return entidades.filter((entidad) => {
      const values = [
        entidad.nombre,
        entidad.documento,
        entidad.condicionIva,
        entidad.email,
        entidad.telefono,
        entidad.domicilio,
        entidad.tipo,
      ];

      return values.some((value) => normalizeSearch(value).includes(term));
    });
  }, [entidades, search]);

  const metricas = useMemo(() => {
    return {
      total: entidades.length,
      clientes: entidades.filter((item) => item.tipo === "cliente").length,
      proveedores: entidades.filter((item) => item.tipo === "proveedor").length,
      inactivos: entidades.filter((item) => item.activa === false).length,
    };
  }, [entidades]);

  function openCreate(tipo = "cliente") {
    setForm({ ...emptyForm, tipo });
    setFormOpen(true);
    setError("");
  }

  function openEdit(entidad) {
    setForm({
      id: entidad.id,
      tipo: entidad.tipo || "cliente",
      nombre: entidad.nombre || "",
      documento: entidad.documento || "",
      condicionIva: entidad.condicionIva || "",
      email: entidad.email || "",
      telefono: entidad.telefono || "",
      domicilio: entidad.domicilio || "",
    });
    setFormOpen(true);
    setError("");
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canManage) return;

    setSaving(true);
    setError("");

    try {
      await upsertEntidadCuentaCorriente(form);
      setFormOpen(false);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      console.error("Error guardando cliente/proveedor:", err);
      setError(err.message || "No se pudo guardar la entidad.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActiva(entidad) {
    if (!canEdit) return;

    const accion = entidad.activa ? "desactivar" : "reactivar";
    if (!window.confirm(`¿${accion} ${entidad.nombre}?`)) return;

    try {
      await setEntidadCuentaCorrienteActiva(entidad.id, !entidad.activa);
      await loadData();
    } catch (err) {
      console.error("Error actualizando estado de entidad:", err);
      alert(err.message || "No se pudo actualizar el estado.");
    }
  }

  return (
    <section className="page">
      <div className="page-header" data-tour="clientes-proveedores-header">
        <div>
          <h2>Clientes y Proveedores</h2>
          <p>Alta, edición y administración de las entidades necesarias para operar ingresos, egresos y cuentas corrientes.</p>
        </div>

        {canCreate && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="secondary-button" type="button" onClick={() => openCreate("proveedor")}>
              <Plus size={16} /> Nuevo proveedor
            </button>
            <button className="primary-button" type="button" onClick={() => openCreate("cliente")}>
              <Plus size={16} /> Nuevo cliente
            </button>
          </div>
        )}
      </div>

      <div className="stats-grid small">
        <div className="stat-card">
          <div>
            <span>Total entidades</span>
            <strong>{metricas.total}</strong>
            <small>Según filtros activos</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>Clientes</span>
            <strong>{metricas.clientes}</strong>
            <small>Disponibles para ingresos</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>Proveedores</span>
            <strong>{metricas.proveedores}</strong>
            <small>Disponibles para egresos</small>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <span>Inactivos</span>
            <strong>{metricas.inactivos}</strong>
            <small>No aparecen en uso operativo</small>
          </div>
        </div>
      </div>

      <div className="filters-bar" data-tour="clientes-proveedores-filtros">
        <select value={tipoFiltro} onChange={(event) => setTipoFiltro(event.target.value)}>
          <option value="todos">Clientes y proveedores</option>
          <option value="cliente">Solo clientes</option>
          <option value="proveedor">Solo proveedores</option>
        </select>

        <select value={estadoFiltro} onChange={(event) => setEstadoFiltro(event.target.value)}>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>

        <input
          placeholder="Buscar por nombre, CUIT, email o teléfono..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <button className="secondary-button" type="button" onClick={loadData}>
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {formOpen && (
        <div className="panel" data-tour="clientes-proveedores-form">
          <div className="page-header" style={{ marginBottom: 12 }}>
            <div>
              <h3>{form.id ? "Editar entidad" : "Nueva entidad"}</h3>
              <p>Completá los datos fiscales y de contacto básicos.</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>
              <X size={15} /> Cancelar
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Tipo
                <select value={form.tipo} onChange={(event) => updateForm("tipo", event.target.value)} required>
                  <option value="cliente">Cliente</option>
                  <option value="proveedor">Proveedor</option>
                </select>
              </label>

              <label>
                Razón social / Nombre
                <input
                  value={form.nombre}
                  onChange={(event) => updateForm("nombre", event.target.value)}
                  placeholder="Ej: Laboratorio CEDIM"
                  required
                />
              </label>

              <label>
                CUIT / Documento
                <input
                  value={form.documento}
                  onChange={(event) => updateForm("documento", event.target.value)}
                  placeholder="Solo números"
                />
              </label>

              <label>
                Condición IVA
                <select
                  value={form.condicionIva}
                  onChange={(event) => updateForm("condicionIva", event.target.value)}
                >
                  <option value="">Sin especificar</option>
                  <option value="Responsable Inscripto">Responsable Inscripto</option>
                  <option value="Monotributo">Monotributo</option>
                  <option value="Exento">Exento</option>
                  <option value="Consumidor Final">Consumidor Final</option>
                </select>
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="administracion@empresa.com"
                />
              </label>

              <label>
                Teléfono
                <input
                  value={form.telefono}
                  onChange={(event) => updateForm("telefono", event.target.value)}
                  placeholder="+54 261..."
                />
              </label>

              <label style={{ gridColumn: "1 / -1" }}>
                Domicilio
                <input
                  value={form.domicilio}
                  onChange={(event) => updateForm("domicilio", event.target.value)}
                  placeholder="Domicilio fiscal o comercial"
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="primary-button" type="submit" disabled={saving || !canManage}>
                <Save size={16} /> {saving ? "Guardando..." : "Guardar entidad"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="panel" data-tour="clientes-proveedores-tabla">
        <h3>Listado de entidades</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Razón social / Nombre</th>
                <th>CUIT / Documento</th>
                <th>Condición IVA</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8">Cargando clientes y proveedores...</td>
                </tr>
              )}

              {!loading && entidadesFiltradas.map((entidad) => (
                <tr key={entidad.id}>
                  <td>{tipoLabels[entidad.tipo] || entidad.tipo}</td>
                  <td>
                    <strong>{entidad.nombre}</strong>
                    {entidad.domicilio && <small style={{ display: "block" }}>{entidad.domicilio}</small>}
                  </td>
                  <td>{entidad.documento || "-"}</td>
                  <td>{entidad.condicionIva || "-"}</td>
                  <td>{entidad.email || "-"}</td>
                  <td>{entidad.telefono || "-"}</td>
                  <td>{entidad.activa ? "Activo" : "Inactivo"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {canEdit && (
                        <button className="secondary-button" type="button" onClick={() => openEdit(entidad)}>
                          <Edit3 size={14} /> Editar
                        </button>
                      )}
                      {canEdit && (
                        <button className="secondary-button" type="button" onClick={() => handleToggleActiva(entidad)}>
                          {entidad.activa ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                          {entidad.activa ? "Desactivar" : "Reactivar"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && entidadesFiltradas.length === 0 && (
                <tr>
                  <td colSpan="8">No hay clientes o proveedores para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
