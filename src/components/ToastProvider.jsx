import { useEffect, useState, useCallback } from "react";

let toastId = 0;

export function ToastProvider() {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((message, type) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

useEffect(() => {
    const onError   = (e) => add(e.detail, "error");
    const onSuccess = (e) => add(e.detail, "success");
    const onInfo    = (e) => add(e.detail, "info");

    window.addEventListener("genetics:error",   onError);
    window.addEventListener("genetics:success", onSuccess);
    window.addEventListener("genetics:info",    onInfo);

    return () => {
      window.removeEventListener("genetics:error",   onError);
      window.removeEventListener("genetics:success", onSuccess);
      window.removeEventListener("genetics:info",    onInfo);
    };
  }, [add]);

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((t) => (
        <div key={t.id} style={{ ...styles.toast, ...styles[t.type] }}>
          <span style={styles.icon}>{icons[t.type]}</span>
          <span style={styles.message}>{t.message}</span>
          <button style={styles.close} onClick={() => remove(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

// Función para disparar toasts desde cualquier archivo
// eslint-disable-next-line react-refresh/only-export-components
export const toast = {
  error:   (msg) => window.dispatchEvent(new CustomEvent("genetics:error",   { detail: msg })),
  success: (msg) => window.dispatchEvent(new CustomEvent("genetics:success", { detail: msg })),
  info:    (msg) => window.dispatchEvent(new CustomEvent("genetics:info",    { detail: msg })),
};

const icons = { error: "✕", success: "✓", info: "ℹ" };

const styles = {
  container: {
    position: "fixed",
    bottom: "153px",
    right: "24px",
    zIndex: 99999,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxWidth: "380px",
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    lineHeight: "1.4",
    boxShadow: "0 2px 12px rgba(0,0,0,.12)",
    pointerEvents: "all",
    border: "0.5px solid",
  },
  error:   { background: "#fff0f0", color: "#7a1f1f", borderColor: "#f7c1c1" },
  success: { background: "#f0faf3", color: "#1a5c30", borderColor: "#c0dd97" },
  info:    { background: "#f0f6ff", color: "#0c447c", borderColor: "#b5d4f4" },
  icon:    { fontWeight: "600", fontSize: "12px", marginTop: "1px", flexShrink: 0 },
  message: { flex: 1 },
  close: {
    background: "none",
    border: "none",
    cursor: "pointer",
    opacity: 0.5,
    fontSize: "12px",
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
  },
};
