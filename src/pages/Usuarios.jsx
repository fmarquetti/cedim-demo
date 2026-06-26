import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Eye, UserCheck, UserX } from "lucide-react";
import Modal from "../components/Modal";
import {
  createUsuario,
  deleteUsuario,
  getUsuarios,
  toggleUsuarioEstado,
  updateUsuarioDevelopmentDisabledPages,
  updateUsuarioPermisos,
} from "../services/usuarioService";
import { getSedes } from "../services/sedeService";
import {
  canPerform,
  getModuleActions,
  getPermissionsForRole,
  getUserPermissions,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
} from "../utils/permissions";
import { getDevelopmentDisabledPages } from "../utils/developmentFlags";
import { normalizeSelectedSede } from "../utils/sedeUtils";

function PermissionEditor({ disabled = false, permissions, role, onChange }) {
  const isAdmin = role === "Administrador";
  const effectivePermissions = isAdmin ? ["all"] : permissions;

  function isChecked(permission) {
    return effectivePermissions.includes("all") || effectivePermissions.includes(permission);
  }

  function togglePermission(permission) {
    if (disabled || isAdmin) return;

    const nextPermissions = permissions.includes(permission)
      ? permissions.filter((item) => item !== permission)
      : [...permissions, permission];

    onChange(nextPermissions);
  }

  return (
    <div className="permissions-editor">
      {isAdmin && (
        <div className="permissions-admin-note">
          El rol Administrador tiene acceso total mediante el permiso all.
        </div>
      )}

      {PERMISSION_MODULES.map((group) => (
        <div className="permissions-group" key={group.group}>
          <h4>{group.group}</h4>

          <div className="permissions-grid">
            {group.modules.map((module) => {
              const actions = getModuleActions(module);

              return (
                <div className="permissions-row" key={module.id}>
                  <strong>{module.label}</strong>

                  <div>
                    {PERMISSION_ACTIONS.filter((action) =>
                      actions.includes(action.id)
                    ).map((action) => {
                      const permission = `${module.id}.${action.id}`;

                      return (
                        <label key={permission}>
                          <input
                            type="checkbox"
                            checked={isChecked(permission)}
                            disabled={disabled || isAdmin}
                            onChange={() => togglePermission(permission)}
                          />
                          <span>{action.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DevelopmentPagesEditor({ disabled = false, pages, onChange }) {
  function isChecked(pageId) {
    return pages.includes(pageId);
  }

  function togglePage(pageId) {
    if (disabled) return;

    const nextPages = pages.includes(pageId)
      ? pages.filter((item) => item !== pageId)
      : [...pages, pageId];

    onChange(nextPages);
  }

  return (
    <div className="development-pages-editor">
      <div className="development-pages-note">
        Las paginas marcadas mostraran el aviso EN DESARROLLO, NO DISPONIBLE para este usuario.
      </div>

      {PERMISSION_MODULES.map((group) => (
        <div className="development-pages-group" key={group.group}>
          <h4>{group.group}</h4>

          <div className="development-pages-grid">
            {group.modules.map((module) => (
              <label className="development-page-toggle" key={module.id}>
                <input
                  type="checkbox"
                  checked={isChecked(module.id)}
                  disabled={disabled}
                  onChange={() => togglePage(module.id)}
                />
                <span>{module.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Usuarios({ selectedSede, currentUser, setCurrentUser }) {
  const [usuarios, setUsuarios] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [search, setSearch] = useState("");
  const [rolFiltro, setRolFiltro] = useState("Todos");
  const [modal, setModal] = useState(null);
  const [selectedUsuario, setSelectedUsuario] = useState(null);
  const [permissionDraft, setPermissionDraft] = useState([]);
  const [developmentDraft, setDevelopmentDraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    email: "",
    rol: "Operador",
    acceso: "Una sede",
    sedeId: "",
    estado: "Activo",
    permisos: [],
    developmentDisabledPages: [],
  });

  const canCreateUsuarios = canPerform(currentUser, "usuarios", "create");
  const canEditUsuarios = canPerform(currentUser, "usuarios", "edit");
  const canDeleteUsuarios = canPerform(currentUser, "usuarios", "delete");

  async function loadData() {
    setLoading(true);

    try {
      const [usuariosData, sedesData] = await Promise.all([
        getUsuarios(),
        getSedes(),
      ]);

      setUsuarios(usuariosData);
      setSedes(sedesData);

      if (!form.sedeId && sedesData.length > 0) {
        setForm((prev) => ({ ...prev, sedeId: sedesData[0].id }));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function filterUsuariosBySede(items, selectedSede) {
    const sede = normalizeSelectedSede(selectedSede);
    if (sede.id === "todas") return items;

    return items.filter((item) => {
      return item.sedeId === sede.id || item.sede === sede.nombre || item.sede === "Todas";
    });
  }

  const usuariosPorSede = filterUsuariosBySede(usuarios, selectedSede);

  const usuariosFiltrados = useMemo(() => {
    return usuariosPorSede.filter((item) => {
      const matchSearch =
        item.nombre.toLowerCase().includes(search.toLowerCase()) ||
        item.email.toLowerCase().includes(search.toLowerCase()) ||
        item.sede.toLowerCase().includes(search.toLowerCase());

      const matchRol = rolFiltro === "Todos" || item.rol === rolFiltro;

      return matchSearch && matchRol;
    });
  }, [usuariosPorSede, search, rolFiltro]);

  const activos = usuariosPorSede.filter((u) => u.estado === "Activo").length;
  const suspendidos = usuariosPorSede.filter((u) => u.estado === "Suspendido").length;
  const multisede = usuariosPorSede.filter((u) => u.acceso === "Todas las sedes").length;
  const sedeUnica = usuariosPorSede.filter((u) => u.acceso === "Una sede").length;

  async function handleCreate(e) {
    e.preventDefault();
    if (!canCreateUsuarios) return;

    setSaving(true);

    try {
      await createUsuario({
        ...form,
        permisos: getPermissionsForRole(form.rol, form.permisos),
      });
      await loadData();

      setForm({
        nombre: "",
        email: "",
        rol: "Operador",
        acceso: "Una sede",
        sedeId: sedes[0]?.id || "",
        estado: "Activo",
        permisos: [],
        developmentDisabledPages: [],
      });

      setModal(null);
    } catch (error) {
      console.error("Error creando usuario:", error);
      alert(error.message || "No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEstado(usuario) {
    if (!canEditUsuarios) return;

    await toggleUsuarioEstado(usuario);
    await loadData();
  }

  async function handleDelete(id) {
    if (!canDeleteUsuarios) return;

    const confirmDelete = window.confirm("¿Eliminar este usuario autorizado?");
    if (!confirmDelete) return;

    await deleteUsuario(id);
    await loadData();
  }

  function abrirDetalle(usuario) {
    setSelectedUsuario(usuario);
    setPermissionDraft(getUserPermissions(usuario).filter((permission) => permission !== "all"));
    setDevelopmentDraft(getDevelopmentDisabledPages(usuario));
    setModal("detalle");
  }

  async function handleSavePermisos() {
    if (!selectedUsuario || !canEditUsuarios) return;

    setSaving(true);

    try {
      await updateUsuarioPermisos(
        selectedUsuario.id,
        permissionDraft,
        selectedUsuario.rol
      );
      await updateUsuarioDevelopmentDisabledPages(
        selectedUsuario.id,
        developmentDraft
      );
      if (selectedUsuario.id === currentUser?.id) {
        setCurrentUser?.((user) => ({
          ...user,
          developmentDisabledPages: developmentDraft,
          development_disabled_pages: developmentDraft,
        }));
      }
      await loadData();
      setSelectedUsuario(null);
      setModal(null);
    } catch (error) {
      console.error("Error guardando permisos:", error);
      alert(error.message || "No se pudo guardar la configuracion.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Usuarios</h2>
          <p>Gestión de roles, permisos y acceso por sociedad o sede.</p>
        </div>

        {canCreateUsuarios && (
          <button className="primary-button" onClick={() => setModal("nuevo")}>
            <Plus size={16} /> Nuevo usuario
          </button>
        )}
      </div>

      <div className="stats-grid small">
        <div className="stat-card">
          <div>
            <span>Usuarios activos</span>
            <strong>{activos}</strong>
            <small>Con acceso habilitado</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Suspendidos</span>
            <strong>{suspendidos}</strong>
            <small>Acceso bloqueado</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Acceso global</span>
            <strong>{multisede}</strong>
            <small>Todas las sedes</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Acceso limitado</span>
            <strong>{sedeUnica}</strong>
            <small>Una sola sede</small>
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <input
          placeholder="Buscar por nombre, email o sede..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={rolFiltro} onChange={(e) => setRolFiltro(e.target.value)}>
          <option>Todos</option>
          <option>Administrador</option>
          <option>Contador</option>
          <option>Operador</option>
          <option>Recepción</option>
          <option>Bioquímico</option>
        </select>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Acceso</th>
              <th>Sede</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="7">Cargando usuarios...</td>
              </tr>
            )}

            {!loading &&
              usuariosFiltrados.map((item) => (
                <tr key={item.id}>
                  <td>{item.nombre}</td>
                  <td>{item.email}</td>
                  <td>{item.rol}</td>
                  <td>{item.acceso}</td>
                  <td>{item.sede}</td>
                  <td>
                    <span className={`status-badge ${item.estado.toLowerCase()}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button onClick={() => abrirDetalle(item)}>
                        <Eye size={16} />
                      </button>

                      {canEditUsuarios && (
                        <button onClick={() => handleToggleEstado(item)}>
                          {item.estado === "Activo" ? (
                            <UserX size={16} />
                          ) : (
                            <UserCheck size={16} />
                          )}
                        </button>
                      )}

                      {canDeleteUsuarios && (
                        <button onClick={() => handleDelete(item.id)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

            {!loading && usuariosFiltrados.length === 0 && (
              <tr>
                <td colSpan="7">No se encontraron usuarios.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === "nuevo" && (
        <Modal title="Nuevo usuario autorizado" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              Nombre
              <input
                required
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>

            <label>
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>

            <label>
              Rol
              <select
                value={form.rol}
                onChange={(e) =>
                  setForm({
                    ...form,
                    rol: e.target.value,
                    permisos: getPermissionsForRole(e.target.value, form.permisos),
                  })
                }
              >
                <option>Administrador</option>
                <option>Contador</option>
                <option>Operador</option>
                <option>Recepción</option>
                <option>Bioquímico</option>
              </select>
            </label>

            <label>
              Tipo de acceso
              <select
                value={form.acceso}
                onChange={(e) => setForm({ ...form, acceso: e.target.value })}
              >
                <option>Una sede</option>
                <option>Todas las sedes</option>
              </select>
            </label>

            {form.acceso === "Una sede" && (
              <label>
                Sede asignada
                <select
                  value={form.sedeId}
                  onChange={(e) => setForm({ ...form, sedeId: e.target.value })}
                  required
                >
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="full">
              <PermissionEditor
                permissions={form.permisos}
                role={form.rol}
                onChange={(permisos) => setForm({ ...form, permisos })}
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Creando..." : "Crear usuario"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "detalle" && selectedUsuario && (
        <Modal
          title={`Permisos de ${selectedUsuario.nombre}`}
          onClose={() => setModal(null)}
        >
          <div className="detail-grid">
            <div>
              <span>Email</span>
              <strong>{selectedUsuario.email}</strong>
            </div>

            <div>
              <span>Rol</span>
              <strong>{selectedUsuario.rol}</strong>
            </div>

            <div>
              <span>Acceso</span>
              <strong>{selectedUsuario.acceso}</strong>
            </div>

            <div>
              <span>Sede</span>
              <strong>{selectedUsuario.sede}</strong>
            </div>

            <div>
              <span>Estado</span>
              <strong>{selectedUsuario.estado}</strong>
            </div>

            <div className="full">
              <span>Vinculación Auth</span>
              <strong>
                {selectedUsuario.authUserId
                  ? "Usuario vinculado con Supabase Auth."
                  : "Pendiente: crear este email en Supabase Auth. Se vincula automáticamente al iniciar sesión."}
              </strong>
            </div>
          </div>

          <PermissionEditor
            disabled={!canEditUsuarios}
            permissions={permissionDraft}
            role={selectedUsuario.rol}
            onChange={setPermissionDraft}
          />

          <section className="development-section">
            <div>
              <h4>Funcionalidades en desarrollo</h4>
              <p>
                Activa este aviso para funcionalidades que el usuario no deberia usar todavia,
                aunque tenga permiso de acceso.
              </p>
            </div>

            <DevelopmentPagesEditor
              disabled={!canEditUsuarios}
              pages={developmentDraft}
              onChange={setDevelopmentDraft}
            />
          </section>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setModal(null)}
            >
              Cerrar
            </button>

            {canEditUsuarios && (
              <button
                type="button"
                className="primary-button"
                onClick={handleSavePermisos}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar configuracion"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
