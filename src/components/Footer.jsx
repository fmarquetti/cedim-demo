import { useAppConfig } from "../context/AppConfigContext";

export default function Footer() {
  const year = new Date().getFullYear();
  const version = "v0.5.1";
  const { config } = useAppConfig();

  return (
    <footer className="app-footer">
      <div className="footer-left">
        <span>© {year} {config.platformName || "Genetics"}</span>
        <span className="footer-separator">•</span>
        <span>{version}</span>
        <span>Ambiente: {config.footerEnvironment || "Demo"}</span>
      </div>

      <div className="footer-right">
        <span>{config.footerText || "Creado por TECNEW"}</span>
      </div>
    </footer>
  );
}