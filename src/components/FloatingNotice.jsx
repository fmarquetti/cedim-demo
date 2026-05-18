import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { useAppConfig } from "../context/AppConfigContext";

export default function FloatingNotice() {
  const { config } = useAppConfig();
  const [closed, setClosed] = useState(false);

  if (!config.paymentNoticeEnabled || closed) {
    return null;
  }

  return (
    <div className="floating-notice">
      <div className="floating-notice-icon">
        <AlertTriangle size={18} />
      </div>

      <div>
        <strong>Aviso administrativo</strong>
        <p>{config.paymentNoticeText}</p>
      </div>

      <button type="button" onClick={() => setClosed(true)} title="Cerrar aviso">
        <X size={16} />
      </button>
    </div>
  );
}