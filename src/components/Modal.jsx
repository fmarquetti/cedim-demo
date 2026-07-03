import { X } from "lucide-react";

export default function Modal({ title, children, onClose, size = "normal" }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
