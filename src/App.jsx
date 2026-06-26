import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";

import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import Ingresos from "./pages/Ingresos";
import Egresos from "./pages/Egresos";
import OrdenesPago from "./pages/OrdenesPago";
import CuentasCorrientes from "./pages/CuentasCorrientes";
import ClientesProveedores from "./pages/ClientesProveedores";
import Bancos from "./pages/Bancos";
import Reportes from "./pages/Reportes";
import PanelContador from "./pages/PanelContador";
import Contabilidad from "./pages/Contabilidad";
import AsientosManuales from "./pages/AsientosManuales";
import SaldosIniciales from "./pages/SaldosIniciales";
import PeriodosContables from "./pages/PeriodosContables";
import AuditoriaContable from "./pages/AuditoriaContable";
import HistorialAuditoria from "./pages/HistorialAuditoria";
import CierreEjercicio from "./pages/CierreEjercicio";
import Iva from "./pages/Iva";
import Documentos from "./pages/Documentos";
import Pacientes from "./pages/Pacientes";
import Turnos from "./pages/Turnos";
import Sedes from "./pages/Sedes";
import Usuarios from "./pages/Usuarios";
import Configuracion from "./pages/Configuracion";
import ConfiguracionFiscal from "./pages/ConfiguracionFiscal";
import SetPassword from "./pages/setPassword";
import Facturacion from "./pages/Facturacion";
import Importaciones from "./pages/Importaciones";
import PropuestasComerciales from "./pages/PropuestasComerciales";
import Tickets from "./pages/Tickets";

import Footer from "./components/Footer";
import HelpAssistant from "./components/HelpAssistant";
import { ToastProvider } from "./components/ToastProvider";
import { AppConfigProvider } from "./context/AppConfigContext";
import { useAppConfig } from "./context/AppConfigContext";
import FloatingNotice from "./components/FloatingNotice";
import DevelopmentNotice from "./components/DevelopmentNotice";
import { canAccessInternalTools } from "./utils/internalAccess";
import { canViewPage, getFirstPermittedPage } from "./utils/permissions";
import {
  getDbSedeId,
  getSedeId as getNormalizedSedeId,
  resolveEffectiveSede,
  TODAS_LAS_SEDES,
} from "./utils/sedeUtils";

import DemoTour from "./components/DemoTour";

const appPageIds = [
  "dashboard",
  "ingresos",
  "egresos",
  "ordenesPago",
  "clientesProveedores",
  "cuentas",
  "bancos",
  "reportes",
  "panelContador",
  "contabilidad",
  "asientosManuales",
  "saldosIniciales",
  "periodosContables",
  "auditoriaContable",
  "historialAuditoria",
  "cierreEjercicio",
  "iva",
  "documentos",
  "pacientes",
  "turnos",
  "sedes",
  "usuarios",
  "configuracion",
  "configuracionFiscal",
  "facturacion",
  "importaciones",
  "propuestasComerciales",
  "tickets",
];

function getSedeId(selectedSede) {
  return getNormalizedSedeId(selectedSede);
}

function getPage(activePage, selectedSede, currentUser, setActivePage, setCurrentUser) {
  const sedeId = getSedeId(selectedSede);
  const dbSedeId = getDbSedeId(selectedSede);

  const props = {
    selectedSede,
    sedeId,
    dbSedeId,
    currentUser,
    setActivePage,
    setCurrentUser,
  };

  const pages = {
    dashboard: <Dashboard {...props} />,
    ingresos: <Ingresos {...props} />,
    egresos: <Egresos {...props} />,
    ordenesPago: <OrdenesPago {...props} />,
    clientesProveedores: <ClientesProveedores {...props} />,
    cuentas: <CuentasCorrientes {...props} />,
    bancos: <Bancos {...props} />,
    reportes: <Reportes {...props} />,
    panelContador: <PanelContador {...props} />,
    contabilidad: <Contabilidad {...props} />,
    asientosManuales: <AsientosManuales {...props} />,
    saldosIniciales: <SaldosIniciales {...props} />,
    periodosContables: <PeriodosContables {...props} />,
    auditoriaContable: <AuditoriaContable {...props} />,
    historialAuditoria: <HistorialAuditoria {...props} />,
    cierreEjercicio: <CierreEjercicio {...props} />,
    iva: <Iva {...props} />,
    documentos: <Documentos {...props} />,
    pacientes: <Pacientes {...props} />,
    turnos: <Turnos {...props} />,
    sedes: <Sedes {...props} />,
    usuarios: <Usuarios {...props} />,
    configuracion: <Configuracion {...props} />,
    configuracionFiscal: <ConfiguracionFiscal {...props} />,
    facturacion: <Facturacion {...props} />,
    importaciones: <Importaciones {...props} />,
    propuestasComerciales: <PropuestasComerciales {...props} />,
    tickets: <Tickets {...props} />,
  };

  return pages[activePage] || pages.dashboard;
}

function AppContent() {
  const { config } = useAppConfig();
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedSede, setSelectedSede] = useState(TODAS_LAS_SEDES);
  const [currentUser, setCurrentUser] = useState(null);

  const pathname = window.location.pathname;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const permittedPageIds = useMemo(() => {
    const hiddenMenuItems = Array.isArray(config.hiddenMenuItems)
      ? config.hiddenMenuItems
      : [];

    if (!currentUser) return [];

    return appPageIds.filter((pageId) => {
      if (hiddenMenuItems.includes(pageId)) return false;
      if (pageId === "propuestasComerciales") {
        return canAccessInternalTools(currentUser);
      }

      return canViewPage(currentUser, pageId);
    });
  }, [config.hiddenMenuItems, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (permittedPageIds.includes(activePage)) return;

    const fallbackPage =
      (canViewPage(currentUser, "dashboard") && !config.hiddenMenuItems?.includes("dashboard"))
        ? "dashboard"
        : getFirstPermittedPage(currentUser, permittedPageIds);

    if (fallbackPage && fallbackPage !== activePage) {
      queueMicrotask(() => setActivePage(fallbackPage));
    }
  }, [activePage, config.hiddenMenuItems, currentUser, permittedPageIds]);

  if (pathname.includes("/set-password")) {
    return <SetPassword />;
  }

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  const effectiveSelectedSede = resolveEffectiveSede(currentUser, selectedSede);
  const activePageAllowed = permittedPageIds.includes(activePage);

  return (
    <div className={`app-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        currentUser={currentUser}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        onTicketCreated={() => window.dispatchEvent(new Event("tickets:changed"))}
      />

      <main className="main-content">
        <Header
          selectedSede={effectiveSelectedSede}
          setSelectedSede={setSelectedSede}
          currentUser={currentUser}
          onLogout={() => setCurrentUser(null)}
        />

        <DemoTour activePage={activePage} currentUser={currentUser} />
        <DevelopmentNotice currentUser={currentUser} activePage={activePage} />

        <div className="page-content" data-tour="page-content">
          {activePageAllowed ? (
            getPage(activePage, effectiveSelectedSede, currentUser, setActivePage, setCurrentUser)
          ) : (
            <section className="page">
              <div className="empty-state">
                No tenes permisos para acceder a esta seccion.
              </div>
            </section>
          )}
        </div>

        <Footer />

        <HelpAssistant
          activePage={activePage}
          setActivePage={setActivePage}
          currentUser={currentUser}
        />

        <FloatingNotice />

        <ToastProvider />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppConfigProvider>
      <AppContent />
    </AppConfigProvider>
  );
}
