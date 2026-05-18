// src/components/Modal.jsx

export default function Modal({ title, children, onClose, size = "normal" }) {
  return (
    <div className="modal-backdrop">
      <div className={`modal modal-${size}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}