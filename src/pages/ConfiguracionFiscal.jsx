import { useCallback, useEffect, useState } from "react";
import { Save, X } from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { getCuentasContables } from "../services/contabilidadService";
import { getTiposTributos } from "../services/fiscalService";
import { toast } from "../components/ToastProvider";

const emptyForm = {
  id: null,
  codigo: "",
  nombre: "",
  categoria: "retencion",
  jurisdiccion: "",
  cuentaContableId: "",
  activo: true,
};

const categorias = [
  ["retencion", "Retencion"],
  ["percepcion", "Percepcion"],
  ["impuesto", "Impuesto"],
  ["tasa", "Tasa"],
  ["otro", "Otro"],
];

export default function ConfiguracionFiscal() {
  const [tributos, setTributos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tiposData, cuentasData] = await Promise.all([
        getTiposTributos(),
        getCuentasContables(),
      ]);
      setTributos(tiposData || []);
      setCuentas((cuentasData || []).filter((cuenta) => cuenta.imputable && cuenta.activa));
    } catch (error) {
      toast.error(error.message || "No se pudo cargar la configuracion fiscal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData();
    });
  }, [loadData]);

  function editTributo(item) {
    setForm({
      id: item.id,
      codigo: item.codigo || "",
      nombre: item.nombre || "",
      categoria: item.categoria || "retencion",
      jurisdiccion: item.jurisdiccion || "",
      cuentaContableId: item.cuenta_contable_id || "",
      activo: item.activo !== false,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.codigo.trim() || !form.nombre.trim()) {
      toast.error("Codigo y nombre son requeridos.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        codigo: form.codigo.trim().toUpperCase(),
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        jurisdiccion: form.jurisdiccion.trim() || null,
        cuenta_contable_id: form.cuentaContableId || null,
        activo: form.activo,
        updated_at: new Date().toISOString(),
      };

      const query = form.id
        ? supabase.from("tributos_tipos").update(payload).eq("id", form.id)
        : supabase.from("tributos_tipos").insert(payload);

      const { error } = await query;
      if (error) throw error;

      setForm(emptyForm);
      await loadData();
      toast.success("Tipo de tributo guardado.");
    } catch (error) {
      toast.error(error.message || "No se pudo guardar el tipo de tributo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <div className="page-header" data-tour="configuracion-fiscal-header">
        <div>
          <h2>Configuracion Fiscal</h2>
          <p>Tipos de retenciones, percepciones e impuestos.</p>
        </div>
      </div>

      <div className="panel" data-tour="configuracion-fiscal-tabla">
        <h3>Tipos de tributos</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Nombre</th>
                <th>Categoria</th>
                <th>Jurisdiccion</th>
                <th>Cuenta contable</th>
                <th>Activo</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6">Cargando tributos...</td>
                </tr>
              )}
              {!loading &&
                tributos.map((item) => (
                  <tr key={item.id} onClick={() => editTributo(item)} className="clickable-row">
                    <td><strong>{item.codigo}</strong></td>
                    <td>{item.nombre}</td>
                    <td>{item.categoria}</td>
                    <td>{item.jurisdiccion || "-"}</td>
                    <td>{item.contabilidad_cuentas?.codigo || "-"}</td>
                    <td>{item.activo ? "Si" : "No"}</td>
                  </tr>
                ))}
              {!loading && tributos.length === 0 && (
                <tr>
                  <td colSpan="6">No hay tributos configurados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" data-tour="configuracion-fiscal-formulario">
        <div className="split-header">
          <div>
            <h3>{form.id ? "Editar tributo" : "Nuevo tributo"}</h3>
            <p className="muted">Asocia una cuenta contable solo cuando corresponda.</p>
          </div>
          {form.id && (
            <button type="button" className="secondary-button" onClick={() => setForm(emptyForm)}>
              <X size={16} /> Cancelar edicion
            </button>
          )}
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Codigo
            <input value={form.codigo} onChange={(event) => setForm({ ...form, codigo: event.target.value })} required />
          </label>
          <label>
            Nombre
            <input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
          </label>
          <label>
            Categoria
            <select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })}>
              {categorias.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Jurisdiccion
            <input value={form.jurisdiccion} onChange={(event) => setForm({ ...form, jurisdiccion: event.target.value })} />
          </label>
          <label>
            Cuenta contable
            <select value={form.cuentaContableId} onChange={(event) => setForm({ ...form, cuentaContableId: event.target.value })}>
              <option value="">Sin cuenta asociada</option>
              {cuentas.map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>{cuenta.codigo} - {cuenta.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Activo
            <select value={form.activo ? "true" : "false"} onChange={(event) => setForm({ ...form, activo: event.target.value === "true" })}>
              <option value="true">Si</option>
              <option value="false">No</option>
            </select>
          </label>
          <div className="modal-actions full">
            <button type="submit" className="primary-button" disabled={saving}>
              <Save size={16} /> {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
