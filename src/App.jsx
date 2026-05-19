import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";

import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";
import Ingresos from "./pages/Ingresos";
import Egresos from "./pages/Egresos";
import CuentasCorrientes from "./pages/CuentasCorrientes";
import Bancos from "./pages/Bancos";
import Reportes from "./pages/Reportes";
import Documentos from "./pages/Documentos";
import Pacientes from "./pages/Pacientes";
import Turnos from "./pages/Turnos";
import Sedes from "./pages/Sedes";
import Usuarios from "./pages/Usuarios";
import Configuracion from "./pages/Configuracion";
import SetPassword from "./pages/setPassword";
import Facturacion from "./pages/Facturacion";

import Footer from "./components/Footer";
import HelpAssistant from "./components/HelpAssistant";
import { ToastProvider } from "./components/ToastProvider";
import { AppConfigProvider } from "./context/AppConfigContext";
import FloatingNotice from "./components/FloatingNotice";

import DemoTour from "./components/DemoTour";

function getSedeId(selectedSede) {
  if (!selectedSede) return "todas";

  if (typeof selectedSede === "object") {
    return selectedSede.id || selectedSede.sedeId || "todas";
  }

  return "todas";
}

function getPage(activePage, selectedSede, currentUser) {
  const sedeId = getSedeId(selectedSede);

  const props = {
    selectedSede,
    sedeId,
    currentUser,
  };

  const pages = {
    dashboard: <Dashboard {...props} />,
    ingresos: <Ingresos {...props} />,
    egresos: <Egresos {...props} />,
    cuentas: <CuentasCorrientes {...props} />,
    bancos: <Bancos {...props} />,
    reportes: <Reportes {...props} />,
    documentos: <Documentos {...props} />,
    pacientes: <Pacientes {...props} />,
    turnos: <Turnos {...props} />,
    sedes: <Sedes {...props} />,
    usuarios: <Usuarios {...props} />,
    configuracion: <Configuracion {...props} />,
    facturacion: <Facturacion {...props} />
  };

  return pages[activePage] || pages.dashboard;
}

function getEffectiveSelectedSede(currentUser, selectedSede) {
  if (currentUser?.access !== "Una sede") {
    return selectedSede;
  }

  if (currentUser?.sede && typeof currentUser.sede === "object") {
    return currentUser.sede;
  }

  if (currentUser?.sedeId) {
    return {
      id: currentUser.sedeId,
      nombre: currentUser.sede || currentUser.sedeNombre || "Sede asignada",
    };
  }

  return selectedSede;
}

function AppContent() {
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedSede, setSelectedSede] = useState("Todas las sedes");
  const [currentUser, setCurrentUser] = useState(null);

  const pathname = window.location.pathname;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (pathname.includes("/set-password")) {
    return <SetPassword />;
  }

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  const effectiveSelectedSede = getEffectiveSelectedSede(currentUser, selectedSede);

  return (
    <div className={`app-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        currentUser={currentUser}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      <main className="main-content">
        <Header
          selectedSede={effectiveSelectedSede}
          setSelectedSede={setSelectedSede}
          currentUser={currentUser}
          onLogout={() => setCurrentUser(null)}
        />

        <DemoTour activePage={activePage} currentUser={currentUser} />

        <div className="page-content" data-tour="page-content">
          {getPage(activePage, effectiveSelectedSede, currentUser)}
        </div>

        <Footer />

        <HelpAssistant activePage={activePage} setActivePage={setActivePage} />

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