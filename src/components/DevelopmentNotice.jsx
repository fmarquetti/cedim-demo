import { AlertTriangle } from "lucide-react";

import { isPageDevelopmentDisabled } from "../utils/developmentFlags";

export default function DevelopmentNotice({ currentUser, activePage }) {
  if (!isPageDevelopmentDisabled(currentUser, activePage)) return null;

  return (
    <div className="development-notice" aria-live="polite">
      <AlertTriangle size={18} />
      <span>EN DESARROLLO, NO DISPONIBLE</span>
    </div>
  );
}
