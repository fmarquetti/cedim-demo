import {
    LayoutDashboard,
    ArrowDownCircle,
    ArrowUpCircle,
    Wallet,
    Landmark,
    FileBarChart,
    FileText,
    Users,
    CalendarClock,
    Building2,
    UserCog,
    Settings,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";

import logo from "../assets/logo-genetics.png";
import { useAppConfig } from "../context/AppConfigContext";

const menu = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "ingresos", label: "Ingresos", icon: ArrowDownCircle },
    { id: "egresos", label: "Egresos", icon: ArrowUpCircle },
    { id: "cuentas", label: "Cuentas corrientes", icon: Wallet },
    { id: "bancos", label: "Bancos", icon: Landmark },
    { id: "reportes", label: "Reportes", icon: FileBarChart },
    { id: "documentos", label: "Documentos", icon: FileText },
    { id: "pacientes", label: "Pacientes y estudios", icon: Users },
    { id: "turnos", label: "Turnos", icon: CalendarClock },
    { id: "sedes", label: "Sociedades / Sedes", icon: Building2 },
    { id: "usuarios", label: "Usuarios", icon: UserCog },
    { id: "configuracion", label: "Configuración", icon: Settings },
];

export default function Sidebar({
    activePage,
    setActivePage,
    currentUser,
    collapsed,
    setCollapsed,
}) {
    const { config } = useAppConfig();

    const hiddenMenuItems = Array.isArray(config.hiddenMenuItems)
        ? config.hiddenMenuItems
        : [];

    const visibleMenu = menu.filter((item) => {
        if (!currentUser) return false;

        if (hiddenMenuItems.includes(item.id)) {
            return false;
        }

        if (currentUser.permissions.includes("all")) return true;

        return currentUser.permissions.includes(item.id);
    });

    const brandLogo = config.platformIconUrl || logo;

    return (
        <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
            <div className="brand">
                <img src={brandLogo} alt={config.platformName || "Genetics"} />

                <div>
                    <strong>{config.platformName || "Genetics"}</strong>
                    <span>{config.platformSubtitle || "Laboratorio clínico"}</span>
                </div>

                <button
                    type="button"
                    className="sidebar-toggle"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? "Expandir menú" : "Ocultar menú"}
                >
                    {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                </button>
            </div>

            <nav className="sidebar-nav">
                {visibleMenu.map((item) => {
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.id}
                            className={`nav-item ${activePage === item.id ? "active" : ""}`}
                            onClick={() => setActivePage(item.id)}
                        >
                            <Icon size={18} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="sidebar-user">
                <div className="avatar">
                    {currentUser.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                </div>

                <div>
                    <strong>{currentUser.name}</strong>
                    <span>{currentUser.role}</span>
                </div>
            </div>
        </aside>
    );
}