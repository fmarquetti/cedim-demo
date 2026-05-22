import {
    LayoutDashboard,
    ArrowDownCircle,
    ArrowUpCircle,
    ClipboardCheck,
    Wallet,
    Landmark,
    FileBarChart,
    BookOpenCheck,
    CalendarCheck,
    Percent,
    FileText,
    ReceiptText,
    Users,
    CalendarClock,
    Building2,
    UserCog,
    Settings,
    PanelLeftClose,
    PanelLeftOpen,
    ChevronRight,
    Home,
    Calculator,
    FileSpreadsheet,
    FilePenLine,
    BookPlus,
    Stethoscope,
    ShieldCheck,
    SearchCheck,
} from "lucide-react";

import logo from "../assets/logo-cedim.png";
import { useAppConfig } from "../context/AppConfigContext";

const menuGroups = [
    {
        title: "Principal",
        icon: Home,
        items: [
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        ],
    },
    {
        title: "Gestión contable",
        icon: Calculator,
        items: [
            { id: "ingresos", label: "Ingresos", icon: ArrowDownCircle },
            { id: "egresos", label: "Egresos", icon: ArrowUpCircle },
            { id: "ordenesPago", label: "Órdenes de Pago", icon: ClipboardCheck },
            { id: "cuentas", label: "Cuentas corrientes", icon: Wallet },
            { id: "bancos", label: "Bancos", icon: Landmark },
            { id: "reportes", label: "Reportes", icon: FileBarChart },
        ],
    },
    {
        title: "Contabilidad fiscal",
        icon: FileSpreadsheet,
        items: [
            { id: "contabilidad", label: "Contabilidad", icon: BookOpenCheck },
            { id: "asientosManuales", label: "Asientos Manuales", icon: FilePenLine },
            { id: "saldosIniciales", label: "Saldos Iniciales", icon: BookPlus },
            { id: "periodosContables", label: "Períodos Contables", icon: CalendarCheck },
            { id: "auditoriaContable", label: "Auditoría Contable", icon: SearchCheck },
            { id: "iva", label: "IVA", icon: Percent },
            { id: "documentos", label: "Documentos", icon: FileText },
            { id: "facturacion", label: "Facturación", icon: ReceiptText },
        ],
    },
    {
        title: "Operación médica",
        icon: Stethoscope,
        items: [
            { id: "pacientes", label: "Pacientes y estudios", icon: Users },
            { id: "turnos", label: "Turnos", icon: CalendarClock },
        ],
    },
    {
        title: "Administración",
        icon: ShieldCheck,
        items: [
            { id: "sedes", label: "Sociedades / Sedes", icon: Building2 },
            { id: "usuarios", label: "Usuarios", icon: UserCog },
            { id: "configuracion", label: "Configuración", icon: Settings },
        ],
    },
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

    const userPermissions = Array.isArray(currentUser?.permissions)
        ? currentUser.permissions
        : [];

    const canSeeItem = (item) => {
        if (!currentUser) return false;

        if (hiddenMenuItems.includes(item.id)) {
            return false;
        }

        if (userPermissions.includes("all")) {
            return true;
        }

        return userPermissions.includes(item.id);
    };

    const visibleMenuGroups = menuGroups
        .map((group) => ({
            ...group,
            items: group.items.filter(canSeeItem),
        }))
        .filter((group) => group.items.length > 0);

    const brandLogo = config.platformIconUrl || logo;

    const userInitials = currentUser?.name
        ? currentUser.name
              .split(" ")
              .filter(Boolean)
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
        : "US";

    return (
        <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
            <div className="brand">
                <img src={brandLogo} alt={config.platformName || "CEDIM"} />

                <div className="brand-text">
                    <strong>{config.platformName || "CEDIM"}</strong>
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
                {visibleMenuGroups.map((group) => {
                    const GroupIcon = group.icon;
                    const groupIsActive = group.items.some((item) => item.id === activePage);

                    return (
                        <div
                            className={`nav-group ${groupIsActive ? "active" : ""}`}
                            key={group.title}
                        >
                            <button
                                type="button"
                                className="nav-group-trigger"
                                title={collapsed ? group.title : undefined}
                            >
                                <div className="nav-group-trigger-left">
                                    <GroupIcon size={18} />
                                    <span>{group.title}</span>
                                </div>

                                <ChevronRight size={16} className="nav-group-chevron" />
                            </button>

                            <div className="nav-group-menu">
                                {group.items.map((item) => {
                                    const Icon = item.icon;

                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`nav-item ${
                                                activePage === item.id ? "active" : ""
                                            }`}
                                            onClick={() => setActivePage(item.id)}
                                        >
                                            <Icon size={17} />
                                            <span>{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>

            {currentUser && (
                <div className="sidebar-user">
                    <div className="avatar">
                        {userInitials}
                    </div>

                    <div className="sidebar-user-info">
                        <strong>{currentUser.name}</strong>
                        <span>{currentUser.role}</span>
                    </div>
                </div>
            )}
        </aside>
    );
}
