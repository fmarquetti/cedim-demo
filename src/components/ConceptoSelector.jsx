import { useMemo, useState } from "react";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import {
  createConceptoItem,
  deleteConceptoItem,
  updateConceptoItem,
} from "../services/conceptoItemService";
import { toast } from "./ToastProvider";
import "./ConceptoSelector.css";

export default function ConceptoSelector({
  tipo,
  items,
  value,
  onChange,
  onItemsChange,
}) {
  const [search, setSearch] = useState("");
  const [otro, setOtro] = useState("");
  const [showManager, setShowManager] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState(tipo);
  const [editingId, setEditingId] = useState(null);
  const [editingNombre, setEditingNombre] = useState("");
  const [editingTipo, setEditingTipo] = useState(tipo);
  const [saving, setSaving] = useState(false);

  const selectedItems = Array.isArray(value) ? value : [];

  const filteredItems = useMemo(() => {
    const cleanSearch = search.toLowerCase().trim();

    return (items || [])
      .filter((item) => item.activo)
      .filter((item) => item.tipo === tipo || item.tipo === "ambos")
      .filter((item) => {
        if (!cleanSearch) return true;
        return item.nombre.toLowerCase().includes(cleanSearch);
      });
  }, [items, search, tipo]);

  const selectedIds = new Set(
    selectedItems.filter((item) => item.id).map((item) => item.id)
  );

  function toggleItem(item) {
    const exists = selectedItems.some((selected) => selected.id === item.id);

    if (exists) {
      onChange(selectedItems.filter((selected) => selected.id !== item.id));
      return;
    }

    onChange([
      ...selectedItems,
      {
        id: item.id,
        nombre: item.nombre,
        tipo: item.tipo,
        origen: "predefinido",
      },
    ]);
  }

  function removeItem(index) {
    onChange(selectedItems.filter((_, itemIndex) => itemIndex !== index));
  }

  function addOtro() {
    const cleanOtro = otro.trim();

    if (!cleanOtro) return;

    const yaExiste = selectedItems.some(
      (item) => item.nombre.toLowerCase() === cleanOtro.toLowerCase()
    );

    if (yaExiste) {
      toast.error("Ese concepto ya está seleccionado.");
      return;
    }

    onChange([
      ...selectedItems,
      {
        id: null,
        nombre: cleanOtro,
        tipo,
        origen: "manual",
      },
    ]);

    setOtro("");
  }

  async function handleCreateItem(e) {
    e.preventDefault();

    setSaving(true);

    try {
      const created = await createConceptoItem({
        nombre: nuevoNombre,
        tipo: nuevoTipo,
      });

      onItemsChange([...(items || []), created]);
      setNuevoNombre("");
      setNuevoTipo(tipo);
      toast.success("Concepto agregado.");
    } catch (error) {
      toast.error(error.message || "No se pudo agregar el concepto.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditingNombre(item.nombre);
    setEditingTipo(item.tipo);
  }

  async function saveEdit(item) {
    setSaving(true);

    try {
      const updated = await updateConceptoItem(item.id, {
        nombre: editingNombre,
        tipo: editingTipo,
      });

      onItemsChange(
        (items || []).map((current) =>
          current.id === updated.id ? updated : current
        )
      );

      setEditingId(null);
      setEditingNombre("");
      setEditingTipo(tipo);
      toast.success("Concepto actualizado.");
    } catch (error) {
      toast.error(error.message || "No se pudo actualizar el concepto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(item) {
    if (!window.confirm(`¿Eliminar el concepto "${item.nombre}"?`)) return;

    setSaving(true);

    try {
      await deleteConceptoItem(item.id);

      onItemsChange((items || []).filter((current) => current.id !== item.id));
      onChange(selectedItems.filter((selected) => selected.id !== item.id));

      toast.success("Concepto eliminado.");
    } catch (error) {
      toast.error(error.message || "No se pudo eliminar el concepto.");
    } finally {
      setSaving(false);
    }
  }

  const resumen = selectedItems.map((item) => item.nombre).join(", ");

  return (
    <div className="concept-selector">
      <div className="concept-selector-header">
        <div>
          <strong>Concepto real</strong>
          <small>
            Seleccioná uno o varios conceptos predefinidos, o agregá uno manual.
          </small>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowManager((prev) => !prev)}
        >
          {showManager ? "Ocultar opciones" : "Administrar opciones"}
        </button>
      </div>

      <div className="concept-search">
        <Search size={16} />
        <input
          placeholder="Buscar concepto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="concept-options">
        {filteredItems.map((item) => (
          <button
            type="button"
            key={item.id}
            className={selectedIds.has(item.id) ? "selected" : ""}
            onClick={() => toggleItem(item)}
          >
            {item.nombre}
          </button>
        ))}

        {filteredItems.length === 0 && (
          <span className="concept-empty">No hay conceptos disponibles.</span>
        )}
      </div>

      <div className="concept-other">
        <input
          placeholder="Otro concepto..."
          value={otro}
          onChange={(e) => setOtro(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOtro();
            }
          }}
        />

        <button type="button" className="secondary-button" onClick={addOtro}>
          <Plus size={15} /> Agregar otro
        </button>
      </div>

      {selectedItems.length > 0 && (
        <div className="concept-selected">
          <strong>Seleccionados</strong>

          <div className="concept-selected-list">
            {selectedItems.map((item, index) => (
              <span key={`${item.id || item.nombre}-${index}`}>
                {item.nombre}
                <button type="button" onClick={() => removeItem(index)}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <input type="hidden" value={resumen} readOnly />

      {showManager && (
        <div className="concept-manager">
          <h4>Opciones disponibles</h4>

          <form className="concept-manager-form" onSubmit={handleCreateItem}>
            <input
              placeholder="Nuevo concepto..."
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />

            <select
              value={nuevoTipo}
              onChange={(e) => setNuevoTipo(e.target.value)}
            >
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
              <option value="ambos">Ambos</option>
            </select>

            <button type="submit" className="primary-button" disabled={saving}>
              Agregar
            </button>
          </form>

          <div className="concept-manager-list">
            {(items || []).map((item) => (
              <div className="concept-manager-row" key={item.id}>
                {editingId === item.id ? (
                  <>
                    <input
                      value={editingNombre}
                      onChange={(e) => setEditingNombre(e.target.value)}
                    />

                    <select
                      value={editingTipo}
                      onChange={(e) => setEditingTipo(e.target.value)}
                    >
                      <option value="ingreso">Ingreso</option>
                      <option value="egreso">Egreso</option>
                      <option value="ambos">Ambos</option>
                    </select>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => saveEdit(item)}
                      disabled={saving}
                    >
                      Guardar
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <strong>{item.nombre}</strong>
                      <small>{item.tipo}</small>
                    </div>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startEdit(item)}
                    >
                      <Edit2 size={15} />
                    </button>

                    <button
                      type="button"
                      className="secondary-button danger"
                      onClick={() => handleDeleteItem(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}