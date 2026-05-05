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

import Footer from "./components/Footer";
import HelpAssistant from "./components/HelpAssistant";
import { ToastProvider } from "./components/ToastProvider";

function getSedeId(selectedSede) {
  if (!selectedSede) return "todas";

  if (typeof selectedSede === "object") {
    return selectedSede.id || selectedSede.sedeId || "todas";
  }

  return "todas";
}

function getPage(activePage, selectedSede) {
  const sedeId = getSedeId(selectedSede);

  const props = {
    selectedSede,
    sedeId,
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

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedSede, setSelectedSede] = useState("Todas las sedes");
  const [currentUser, setCurrentUser] = useState(null);

  const pathname = window.location.pathname;

  if (pathname.includes("/set-password")) {
    return <SetPassword />;
  }

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  const effectiveSelectedSede = getEffectiveSelectedSede(currentUser, selectedSede);

  return (
    <div className="app-layout">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        currentUser={currentUser}
      />

      <main className="main-content">
        <Header
          selectedSede={effectiveSelectedSede}
          setSelectedSede={setSelectedSede}
          currentUser={currentUser}
          onLogout={() => setCurrentUser(null)}
        />

        <div className="page-content">
          {getPage(activePage, effectiveSelectedSede)}
        </div>

        <Footer />

        <HelpAssistant activePage={activePage} setActivePage={setActivePage} />

        <ToastProvider />
      </main>
    </div>
  );
}