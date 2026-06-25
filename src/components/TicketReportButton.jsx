import { useState } from "react";
import html2canvas from "html2canvas";
import { MessageCircleWarning } from "lucide-react";

import TicketReportModal from "./TicketReportModal";

export default function TicketReportButton({
  currentUser,
  currentPage,
  collapsed = false,
  onCreated,
}) {
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [error, setError] = useState("");

  async function handleClick() {
    if (capturing) return;

    setError("");
    setCapturing(true);

    try {
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        logging: false,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        ignoreElements: (element) =>
          element.classList?.contains("ticket-report-slot") ||
          element.classList?.contains("ticket-report-button") ||
          element.classList?.contains("ticket-report-error") ||
          element.classList?.contains("ticket-report-modal-overlay") ||
          element.classList?.contains("ticket-report-modal") ||
          element.classList?.contains("ticket-screenshot-editor") ||
          element.closest?.(".ticket-report-modal") ||
          element.closest?.(".ticket-screenshot-editor") ||
          element.hasAttribute?.("data-ticket-report-modal"),
      });

      setScreenshot(canvas.toDataURL("image/png"));
    } catch (captureError) {
      setError(captureError.message || "No se pudo tomar la captura.");
      setScreenshot("");
    } finally {
      setCapturing(false);
    }
  }

  if (!currentUser) return null;

  return (
    <div className="ticket-report-slot">
      <button
        type="button"
        className="ticket-report-button"
        onClick={handleClick}
        title="Reportar problema"
        aria-label="Reportar problema"
        disabled={capturing}
      >
        <MessageCircleWarning size={18} />
        {!collapsed && <span>{capturing ? "Capturando..." : "Reportar problema"}</span>}
      </button>

      {error && !collapsed && <div className="ticket-report-error">{error}</div>}

      {screenshot !== null && (
        <TicketReportModal
          currentUser={currentUser}
          currentPage={currentPage}
          screenshot={screenshot}
          onClose={() => setScreenshot(null)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}
