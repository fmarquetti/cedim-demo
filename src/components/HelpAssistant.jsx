import { useMemo, useRef, useState } from "react";
import {
    HelpCircle,
    MessageCircle,
    Send,
    X,
    ArrowRight,
    RotateCcw,
} from "lucide-react";
import "./HelpAssistant.css";

const helpTopics = [
    {
        id: "pacientes",
        page: "pacientes",
        label: "Pacientes y estudios",
        title: "Cargar un nuevo paciente",
        keywords: [
            "paciente",
            "pacientes",
            "nuevo paciente",
            "cargar paciente",
            "alta paciente",
            "estudio",
            "estudios",
            "muestra",
            "muestras",
            "orden",
            "analisis",
            "análisis",
        ],
        answer:
            "Para cargar un nuevo paciente, ingresá a “Pacientes y estudios”. Desde esa pantalla podés registrar pacientes, cargar estudios, definir prioridad, actualizar estados y consultar el avance de cada muestra.",
        steps: [
            "Abrí el menú lateral.",
            "Entrá en “Pacientes y estudios”.",
            "Usá el botón de carga o alta disponible en la pantalla.",
            "Completá los datos del paciente, estudio, sede, prioridad y estado.",
            "Guardá el registro.",
        ],
    },
    {
        id: "ingresos",
        page: "ingresos",
        label: "Ingresos",
        title: "Registrar un ingreso",
        keywords: [
            "ingreso",
            "ingresos",
            "cobro",
            "cobros",
            "pago",
            "pagos",
            "factura",
            "facturas",
            "recibo",
            "comprobante",
            "venta",
        ],
        answer:
            "Para registrar un ingreso, ingresá a “Ingresos”. Ahí podés cargar cobros, comprobantes, fecha, sede, concepto, medio de pago e importe.",
        steps: [
            "Entrá en “Ingresos”.",
            "Presioná el botón para agregar un nuevo ingreso.",
            "Completá fecha, sede, concepto, medio de pago e importe.",
            "Adjuntá o vinculá el comprobante si corresponde.",
            "Guardá el movimiento.",
        ],
    },
    {
        id: "egresos",
        page: "egresos",
        label: "Egresos",
        title: "Registrar un egreso",
        keywords: [
            "egreso",
            "egresos",
            "gasto",
            "gastos",
            "proveedor",
            "proveedores",
            "compra",
            "compras",
            "pagar",
            "pago proveedor",
            "factura proveedor",
        ],
        answer:
            "Para registrar un egreso, ingresá a “Egresos”. Desde ahí podés cargar gastos del laboratorio, proveedores, comprobantes, sede asociada, concepto e importe.",
        steps: [
            "Entrá en “Egresos”.",
            "Presioná el botón para agregar un nuevo egreso.",
            "Seleccioná sede, proveedor, fecha y concepto.",
            "Cargá el importe y el estado del comprobante.",
            "Guardá el egreso.",
        ],
    },
    {
        id: "bancos",
        page: "bancos",
        label: "Bancos",
        title: "Consultar bancos y movimientos",
        keywords: [
            "banco",
            "bancos",
            "cuenta bancaria",
            "cuentas bancarias",
            "galicia",
            "nacion",
            "nación",
            "mercado pago",
            "mercadopago",
            "caja diaria",
            "conciliar",
            "conciliacion",
            "conciliación",
        ],
        answer:
            "Para revisar cuentas bancarias o movimientos, ingresá a “Bancos”. Desde esa pantalla podés visualizar cuentas, saldos, movimientos y estados de conciliación.",
        steps: [
            "Entrá en “Bancos”.",
            "Revisá las cuentas disponibles.",
            "Filtrá por sede o cuenta si corresponde.",
            "Controlá movimientos pendientes o conciliados.",
        ],
    },
    {
        id: "cuentas",
        page: "cuentas",
        label: "Cuentas corrientes",
        title: "Consultar cuentas corrientes",
        keywords: [
            "cuenta corriente",
            "cuentas corrientes",
            "saldo",
            "saldos",
            "deuda",
            "deudas",
            "cliente debe",
            "proveedor debe",
            "pendiente de cobro",
            "pendiente de pago",
        ],
        answer:
            "Para revisar saldos o movimientos pendientes, ingresá a “Cuentas corrientes”. Ahí podés consultar el estado financiero asociado a clientes o proveedores.",
        steps: [
            "Entrá en “Cuentas corrientes”.",
            "Buscá el cliente o proveedor.",
            "Revisá saldo, movimientos y estado.",
            "Usá los filtros para acotar la información.",
        ],
    },
    {
        id: "reportes",
        page: "reportes",
        label: "Reportes",
        title: "Generar reportes",
        keywords: [
            "reporte",
            "reportes",
            "informe",
            "informes",
            "excel",
            "pdf",
            "exportar",
            "contabilidad",
            "periodo",
            "período",
            "resumen",
        ],
        answer:
            "Para generar reportes, ingresá a “Reportes”. Podés filtrar por sede, período y tipo de información para exportar datos administrativos o contables.",
        steps: [
            "Entrá en “Reportes”.",
            "Seleccioná sede, fechas y tipo de reporte.",
            "Revisá los datos generados.",
            "Exportá en el formato disponible.",
        ],
    },
    {
        id: "documentos",
        page: "documentos",
        label: "Documentos",
        title: "Gestionar documentos",
        keywords: [
            "documento",
            "documentos",
            "pdf",
            "comprobante",
            "comprobantes",
            "afip",
            "factura afip",
            "importar",
            "validar",
            "archivo",
            "adjuntar",
        ],
        answer:
            "Para cargar o revisar comprobantes, ingresá a “Documentos”. Desde ahí podés importar archivos, revisar información detectada y validar los datos antes de cargarlos al sistema.",
        steps: [
            "Entrá en “Documentos”.",
            "Importá o seleccioná el comprobante.",
            "Revisá los datos detectados.",
            "Validá o corregí manualmente la información.",
            "Confirmá la carga.",
        ],
    },
    {
        id: "sedes",
        page: "sedes",
        label: "Sedes",
        title: "Administrar sedes",
        keywords: [
            "sede",
            "sedes",
            "sucursal",
            "sucursales",
            "centro",
            "norte",
            "sur",
            "pilar",
            "oeste",
            "alta sede",
            "editar sede",
        ],
        answer:
            "Para administrar sedes, ingresá a “Sedes”. Esta sección permite revisar, crear o modificar las sedes operativas del laboratorio.",
        steps: [
            "Entrá en “Sedes”.",
            "Revisá el listado de sedes.",
            "Agregá o editá una sede según corresponda.",
            "Guardá los cambios.",
        ],
    },
    {
        id: "usuarios",
        page: "usuarios",
        label: "Usuarios",
        title: "Crear o administrar usuarios",
        keywords: [
            "usuario",
            "usuarios",
            "crear usuario",
            "nuevo usuario",
            "permisos",
            "rol",
            "roles",
            "administrador",
            "operador",
            "contraseña",
            "acceso",
            "suspendido",
        ],
        answer:
            "Para administrar usuarios, ingresá a “Usuarios”. Desde ahí el administrador puede crear usuarios, asignar rol, definir acceso por sede y controlar permisos.",
        steps: [
            "Entrá en “Usuarios”.",
            "Presioná el botón para agregar un usuario.",
            "Completá nombre, email, rol y estado.",
            "Asigná acceso a una sede o a todas las sedes.",
            "Guardá el usuario.",
        ],
    },
    {
        id: "configuracion",
        page: "configuracion",
        label: "Configuración",
        title: "Configurar el sistema",
        keywords: [
            "configuracion",
            "configuración",
            "ajuste",
            "ajustes",
            "parametro",
            "parámetro",
            "preferencia",
            "sistema",
            "general",
        ],
        answer:
            "Para modificar parámetros generales del sistema, ingresá a “Configuración”. Esta sección concentra ajustes administrativos y preferencias operativas.",
        steps: [
            "Entrá en “Configuración”.",
            "Revisá los parámetros disponibles.",
            "Modificá el valor necesario.",
            "Guardá los cambios.",
        ],
    },
    {
        id: "filtro-sede",
        page: "dashboard",
        label: "Filtro por sede",
        title: "Usar el filtro de sedes",
        keywords: [
            "filtro sede",
            "filtrar sede",
            "todas las sedes",
            "cambiar sede",
            "ver sede",
            "sede seleccionada",
            "administrador sede",
            "acceso sede",
        ],
        answer:
            "El filtro de sedes permite ver información de una sede específica o de todas las sedes. Los administradores pueden alternar entre sedes; los usuarios con acceso limitado solo ven la sede asignada.",
        steps: [
            "Buscá el selector de sede en el encabezado superior.",
            "Seleccioná “Todas las sedes” o una sede específica.",
            "El sistema actualizará los datos visibles según esa selección.",
        ],
    },
    {
        id: "dashboard",
        page: "dashboard",
        label: "Dashboard",
        title: "Usar el panel principal",
        keywords: [
            "dashboard",
            "panel",
            "inicio",
            "indicadores",
            "kpi",
            "graficos",
            "gráficos",
            "resumen",
            "principal",
        ],
        answer:
            "El Dashboard muestra un resumen general del laboratorio: indicadores, movimientos, actividad reciente y métricas principales. También respeta el filtro de sede seleccionado.",
        steps: [
            "Entrá en “Dashboard”.",
            "Revisá los indicadores principales.",
            "Usá el filtro de sede para acotar la información.",
            "Consultá gráficos o alertas si están disponibles.",
        ],
    },
];

const quickActions = [
    "Cargar paciente",
    "Registrar ingreso",
    "Registrar egreso",
    "Crear usuario",
    "Ver reportes",
];

const normalizeText = (text) =>
    text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

const findBestTopic = (question) => {
    const normalizedQuestion = normalizeText(question);

    let bestTopic = null;
    let bestScore = 0;

    helpTopics.forEach((topic) => {
        let score = 0;

        topic.keywords.forEach((keyword) => {
            const normalizedKeyword = normalizeText(keyword);

            if (normalizedQuestion.includes(normalizedKeyword)) {
                score += normalizedKeyword.length > 10 ? 3 : 2;
            } else {
                const keywordParts = normalizedKeyword.split(" ");

                keywordParts.forEach((part) => {
                    if (part.length > 3 && normalizedQuestion.includes(part)) {
                        score += 1;
                    }
                });
            }
        });

        if (score > bestScore) {
            bestScore = score;
            bestTopic = topic;
        }
    });

    return bestScore > 0 ? bestTopic : null;
};

const createBotMessage = (topic) => ({
    id: crypto.randomUUID(),
    sender: "bot",
    topic,
    text: topic
        ? topic.answer
        : "No encontré una respuesta exacta. Probá consultando por: cargar paciente, registrar ingreso, registrar egreso, crear usuario, cambiar sede, documentos o reportes.",
});

export default function HelpAssistant({ activePage, setActivePage }) {
    const [isOpen, setIsOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [messages, setMessages] = useState([
        {
            id: crypto.randomUUID(),
            sender: "bot",
            text: "Hola. Soy Tecnew Bot, tu asistente operativo dentro del sistema. Puedo guiarte para cargar pacientes, registrar ingresos o egresos, usar reportes, administrar usuarios y más.",
        },
    ]);

    const inputRef = useRef(null);

    const currentTopic = useMemo(
        () => helpTopics.find((topic) => topic.page === activePage),
        [activePage]
    );

    const sendQuestion = (value = question) => {
        const cleanQuestion = value.trim();

        if (!cleanQuestion) return;

        const topic = findBestTopic(cleanQuestion);

        const userMessage = {
            id: crypto.randomUUID(),
            sender: "user",
            text: cleanQuestion,
        };

        const botMessage = createBotMessage(topic);

        setMessages((prevMessages) => [...prevMessages, userMessage, botMessage]);
        setQuestion("");

        setTimeout(() => {
            inputRef.current?.focus();
        }, 50);
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        sendQuestion();
    };

    const resetChat = () => {
        setMessages([
            {
                id: crypto.randomUUID(),
                sender: "bot",
                text: "Chat reiniciado. Escribí qué necesitás hacer dentro del sistema y te guío paso a paso.",
            },
        ]);
    };

    const goToPage = (page) => {
        if (!page || !setActivePage) return;
        setActivePage(page);
        setIsOpen(false);
    };

    return (
        <>
            <button
                type="button"
                className="help-bot-button"
                onClick={() => setIsOpen(true)}
                aria-label="Abrir asistente de ayuda"
                title="Asistente Tecnew"
            >
                <span className="help-bot-tooltip">¿Necesitás ayuda?</span>

                <span className="tecnew-bot">
                    <svg
                        viewBox="0 0 120 120"
                        role="img"
                        aria-hidden="true"
                        className="tecnew-bot-svg"
                    >
                        <defs>
                            <linearGradient id="doctorBotBody" x1="22" y1="8" x2="98" y2="112">
                                <stop offset="0%" stopColor="#4dd6d0" />
                                <stop offset="55%" stopColor="#0ea5c6" />
                                <stop offset="100%" stopColor="#2563eb" />
                            </linearGradient>

                            <linearGradient id="doctorBotFace" x1="34" y1="30" x2="86" y2="76">
                                <stop offset="0%" stopColor="#ffffff" />
                                <stop offset="100%" stopColor="#eefaff" />
                            </linearGradient>

                            <linearGradient id="doctorCoat" x1="34" y1="78" x2="86" y2="116">
                                <stop offset="0%" stopColor="#ffffff" />
                                <stop offset="100%" stopColor="#e6f6fb" />
                            </linearGradient>
                        </defs>

                        {/* Antena */}
                        <line
                            x1="60"
                            y1="20"
                            x2="60"
                            y2="11"
                            stroke="#0f172a"
                            strokeWidth="5"
                            strokeLinecap="round"
                        />
                        <circle cx="60" cy="8" r="5" fill="#4dd6d0" />

                        {/* Orejas laterales */}
                        <rect x="15" y="44" width="15" height="28" rx="8" fill="#0f172a" />
                        <rect x="90" y="44" width="15" height="28" rx="8" fill="#0f172a" />

                        {/* Cabeza robot */}
                        <rect
                            x="25"
                            y="23"
                            width="70"
                            height="63"
                            rx="24"
                            fill="url(#doctorBotBody)"
                        />

                        {/* Vincha/cofia médica */}
                        <path
                            d="M37 28 C45 17, 75 17, 83 28 L83 40 L37 40 Z"
                            fill="#ffffff"
                        />
                        <path
                            d="M56 26 H64 V34 H72 V42 H64 V50 H56 V42 H48 V34 H56 Z"
                            fill="#ef4444"
                            opacity="0.95"
                            transform="scale(0.72) translate(23 7)"
                        />

                        {/* Cara */}
                        <rect
                            x="36"
                            y="39"
                            width="48"
                            height="34"
                            rx="17"
                            fill="url(#doctorBotFace)"
                        />

                        {/* Ojos */}
                        <circle cx="51" cy="56" r="5" fill="#0f172a" />
                        <circle cx="69" cy="56" r="5" fill="#0f172a" />

                        {/* Brillos */}
                        <circle cx="49" cy="54" r="1.5" fill="#ffffff" />
                        <circle cx="67" cy="54" r="1.5" fill="#ffffff" />

                        {/* Sonrisa */}
                        <path
                            d="M52 64 C56 69, 64 69, 68 64"
                            fill="none"
                            stroke="#0ea5c6"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />

                        {/* Cuerpo / guardapolvo */}
                        <path
                            d="M35 83 H85 C91 83, 95 88, 95 95 V110 H25 V95 C25 88, 29 83, 35 83 Z"
                            fill="url(#doctorCoat)"
                        />

                        {/* Cuello */}
                        <path
                            d="M50 84 L60 96 L70 84"
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />

                        {/* Solapas */}
                        <path
                            d="M43 86 L56 108"
                            stroke="#cbd5e1"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        <path
                            d="M77 86 L64 108"
                            stroke="#cbd5e1"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />

                        {/* Estetoscopio */}
                        <path
                            d="M45 88 C45 100, 53 104, 60 104 C67 104, 75 100, 75 88"
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />
                        <circle cx="45" cy="88" r="3.5" fill="#0f172a" />
                        <circle cx="75" cy="88" r="3.5" fill="#0f172a" />
                        <path
                            d="M60 104 V111"
                            stroke="#0f172a"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />
                        <circle cx="60" cy="113" r="5" fill="#0ea5c6" stroke="#0f172a" strokeWidth="3" />

                        {/* Bolsillo */}
                        <rect x="70" y="96" width="13" height="10" rx="3" fill="#dff5fb" />
                        <path
                            d="M73 101 H80"
                            stroke="#0ea5c6"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />

                        {/* Brazos */}
                        <path
                            d="M29 94 C20 94, 18 86, 20 80"
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                        <path
                            d="M91 94 C100 94, 102 86, 100 80"
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                    </svg>
                </span>
            </button>

            {isOpen && (
                <section className="help-assistant">
                    <div className="help-assistant-header">
                        <div className="help-assistant-title">
                            <div className="help-assistant-icon">
                                <MessageCircle size={20} />
                            </div>
                            <div>
                                <strong>Tecnew Bot</strong>
                                <span>Asistencia operativa dentro del sistema</span>
                            </div>
                        </div>

                        <div className="help-assistant-actions">
                            <button
                                type="button"
                                onClick={resetChat}
                                aria-label="Reiniciar chat"
                                title="Reiniciar chat"
                            >
                                <RotateCcw size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                aria-label="Cerrar asistente"
                                title="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="help-assistant-body">
                        {currentTopic && (
                            <div className="help-context-card">
                                <span>Estás en</span>
                                <strong>{currentTopic.label}</strong>
                                <small>
                                    Podés preguntar cómo usar esta pantalla o elegir una acción
                                    frecuente.
                                </small>
                            </div>
                        )}

                        <div className="help-quick-actions">
                            {quickActions.map((action) => (
                                <button
                                    type="button"
                                    key={action}
                                    onClick={() => sendQuestion(action)}
                                >
                                    {action}
                                </button>
                            ))}
                        </div>

                        <div className="help-messages">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`help-message ${message.sender}`}
                                >
                                    <p>{message.text}</p>

                                    {message.topic?.steps?.length > 0 && (
                                        <ol>
                                            {message.topic.steps.map((step) => (
                                                <li key={step}>{step}</li>
                                            ))}
                                        </ol>
                                    )}

                                    {message.topic?.page && (
                                        <button
                                            type="button"
                                            className="help-go-button"
                                            onClick={() => goToPage(message.topic.page)}
                                        >
                                            Ir a {message.topic.label}
                                            <ArrowRight size={15} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <form className="help-assistant-input" onSubmit={handleSubmit}>
                        <input
                            ref={inputRef}
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            placeholder="Ej: ¿Cómo cargo un nuevo paciente?"
                        />
                        <button type="submit" aria-label="Enviar consulta">
                            <Send size={17} />
                        </button>
                    </form>
                </section>
            )}
        </>
    );
}