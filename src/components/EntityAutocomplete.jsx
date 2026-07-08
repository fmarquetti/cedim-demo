import { useEffect, useMemo, useRef, useState } from "react";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeDocument(value) {
  return String(value || "").replace(/\D/g, "");
}

export default function EntityAutocomplete({
  value,
  onChange,
  items = [],
  placeholder = "",
  required = false,
  emptyMessage = "No se encontraron resultados.",
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const suggestions = useMemo(() => {
    const term = normalizeText(value);
    const document = normalizeDocument(value);

    if (!term && !document) {
      return items.slice(0, 8);
    }

    return items
      .filter((item) => {
        const name = normalizeText(item.nombre);
        const doc = normalizeDocument(item.documento);

        return (
          (term && (name.includes(term) || doc.includes(document) || normalizeText(`${item.nombre} ${item.documento || ""}`).includes(term))) ||
          (document && (doc.includes(document) || name.includes(term)))
        );
      })
      .slice(0, 8);
  }, [items, value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="entity-autocomplete" ref={containerRef}>
      <input
        required={required}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && (
        <div className="entity-autocomplete-results">
          {suggestions.length === 0 ? (
            <div className="entity-autocomplete-empty">{emptyMessage}</div>
          ) : (
            suggestions.map((item) => (
              <button
                type="button"
                key={item.id}
                className="entity-autocomplete-item"
                onClick={() => {
                  onChange(item.documento ? `${item.nombre} - ${item.documento}` : item.nombre);
                  setOpen(false);
                }}
              >
                <strong>{item.nombre}</strong>
                <span>{item.documento || "Sin CUIT"}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
