import { useEffect, useMemo, useRef, useState } from "react";
import {
    HelpCircle,
    MessageCircle,
    Send,
    X,
    ArrowRight,
    RotateCcw,
    ClipboardList,
    Search,
    AlertTriangle,
    Lightbulb,
} from "lucide-react";
import "./HelpAssistant.css";

const STORAGE_KEY = "genetics_help_assistant_messages_v2";

const helpTopics = [
    {
        id: "pacientes",
        page: "pacientes",
        label: "Pacientes y estudios",
        title: "Cargar un nuevo paciente",
        type: "operativo",
        priority: 5,
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
        related: ["ingresos", "documentos", "filtro-sede"],
    },
    {
        id: "ingresos",
        page: "ingresos",
        label: "Ingresos",
        title: "Registrar un ingreso",
        type: "operativo",
        priority: 5,
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
            "cobrado",
            "pendiente de cobro",
        ],
        answer:
            "Para registrar un ingreso, ingresá a “Ingresos”. Ahí podés cargar cobros, comprobantes, fecha, sede, concepto, medio de pago, estado e importe. Si todavía no fue cobrado, dejalo pendiente para luego conciliarlo desde Bancos.",
        steps: [
            "Entrá en “Ingresos”.",
            "Presioná el botón para agregar un nuevo ingreso.",
            "Completá fecha, sede, concepto, medio de pago e importe.",
            "Adjuntá o vinculá el comprobante si corresponde.",
            "Guardá el ingreso.",
            "Cuando el cobro aparezca en el banco, concilialo desde “Bancos”.",
        ],
        related: ["bancos", "conciliacion-manual", "conciliacion-automatica"],
    },
    {
        id: "egresos",
        page: "egresos",
        label: "Egresos",
        title: "Registrar un egreso",
        type: "operativo",
        priority: 5,
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
            "pagado",
            "pendiente de pago",
        ],
        answer:
            "Para registrar un egreso, ingresá a “Egresos”. Desde ahí podés cargar gastos del laboratorio, proveedores, comprobantes, sede asociada, concepto, importe y estado de pago.",
        steps: [
            "Entrá en “Egresos”.",
            "Presioná el botón para agregar un nuevo egreso.",
            "Seleccioná sede, proveedor, fecha y concepto.",
            "Cargá el importe y el estado del comprobante.",
            "Guardá el egreso.",
            "Cuando el pago figure en el banco, concilialo desde “Bancos”.",
        ],
        related: ["bancos", "documentos", "conciliacion-manual"],
    },
    {
        id: "bancos",
        page: "bancos",
        label: "Bancos",
        title: "Consultar bancos y movimientos",
        type: "operativo",
        priority: 6,
        keywords: [
            "banco",
            "bancos",
            "cuenta bancaria",
            "cuentas bancarias",
            "galicia",
            "bbva",
            "macro",
            "nacion",
            "nación",
            "mercado pago",
            "mercadopago",
            "caja diaria",
            "movimiento bancario",
            "movimientos bancarios",
        ],
        answer:
            "Para revisar cuentas bancarias o movimientos, ingresá a “Bancos”. Desde esa pantalla podés visualizar cuentas, saldos, movimientos, extractos importados y estados de conciliación.",
        steps: [
            "Entrá en “Bancos”.",
            "Revisá el resumen de cuentas y movimientos.",
            "Filtrá por sede, cuenta, estado, tipo o período.",
            "Controlá movimientos pendientes, conciliados o sin vincular.",
            "Usá exportación Excel/PDF si necesitás reportes.",
        ],
        related: ["bancos-importar-extracto", "conciliacion-automatica", "bancos-duplicados"],
    },
    {
        id: "bancos-importar-extracto",
        page: "bancos",
        label: "Bancos",
        title: "Importar extracto bancario PDF",
        type: "operativo",
        priority: 10,
        keywords: [
            "extracto",
            "extractos",
            "extracto bancario",
            "importar extracto",
            "pdf banco",
            "pdf bancario",
            "leer extracto",
            "cargar extracto",
            "subir extracto",
            "bbva",
            "galicia",
            "banco galicia",
            "banco bbva",
        ],
        answer:
            "Para importar un extracto bancario, ingresá a “Bancos” y usá “Importar extracto PDF”. El sistema lee PDFs digitales de BBVA y Galicia, detecta banco, cuenta, CBU y movimientos. Luego muestra una vista previa editable antes de guardar.",
        steps: [
            "Entrá en “Bancos”.",
            "Presioná “Importar extracto PDF”.",
            "Seleccioná el archivo PDF digital del banco.",
            "Revisá banco detectado, cuenta, CBU, sede y movimientos.",
            "Corregí manualmente cualquier dato si hace falta.",
            "Confirmá para guardar el PDF e importar los movimientos bancarios.",
        ],
        related: ["bancos-bbva", "bancos-galicia", "bancos-duplicados"],
    },
    {
        id: "bancos-bbva",
        page: "bancos",
        label: "Bancos",
        title: "Importar extractos BBVA",
        type: "operativo",
        priority: 9,
        keywords: [
            "bbva",
            "extracto bbva",
            "resumen bbva",
            "banco bbva",
            "movimientos bbva",
        ],
        answer:
            "Los extractos digitales de BBVA se importan desde “Bancos”. El sistema toma los movimientos de la sección “Movimientos en cuentas” y evita cargar como movimientos adicionales secciones informativas como transferencias recibidas, enviadas, débitos automáticos o inversiones.",
        steps: [
            "Entrá en “Bancos”.",
            "Presioná “Importar extracto PDF”.",
            "Seleccioná el resumen BBVA.",
            "Revisá la vista previa.",
            "Confirmá solo los movimientos nuevos.",
        ],
        related: ["bancos-importar-extracto", "bancos-duplicados"],
    },
    {
        id: "bancos-galicia",
        page: "bancos",
        label: "Bancos",
        title: "Importar extractos Galicia",
        type: "operativo",
        priority: 9,
        keywords: [
            "galicia",
            "banco galicia",
            "extracto galicia",
            "resumen galicia",
            "movimientos galicia",
        ],
        answer:
            "Los extractos digitales de Banco Galicia se importan desde “Bancos”. El sistema lee la sección “Movimientos”, reconoce operaciones multilínea, identifica créditos, débitos y saldo, y corta antes de totales o retenciones.",
        steps: [
            "Entrá en “Bancos”.",
            "Presioná “Importar extracto PDF”.",
            "Seleccioná el extracto Galicia.",
            "Revisá la cuenta, CBU y movimientos detectados.",
            "Confirmá la importación.",
        ],
        related: ["bancos-importar-extracto", "bancos-duplicados"],
    },
    {
        id: "bancos-duplicados",
        page: "bancos",
        label: "Bancos",
        title: "Evitar movimientos duplicados",
        type: "control",
        priority: 8,
        keywords: [
            "duplicado",
            "duplicados",
            "ya importado",
            "movimiento repetido",
            "extracto repetido",
            "importar dos veces",
            "external hash",
            "hash",
        ],
        answer:
            "Al importar extractos, el sistema genera una identificación única por movimiento. Si el movimiento ya fue importado, aparece como “Ya importado” y queda bloqueado para evitar duplicados. También detecta duplicados dentro del mismo PDF.",
        steps: [
            "Importá el extracto desde “Bancos”.",
            "Revisá la columna de estado en la vista previa.",
            "Los movimientos nuevos quedan seleccionados.",
            "Los duplicados quedan bloqueados.",
            "Confirmá solo los movimientos válidos.",
        ],
        related: ["bancos-importar-extracto", "conciliacion-automatica"],
    },
    {
        id: "bancos-cuentas-automaticas",
        page: "bancos",
        label: "Bancos",
        title: "Creación automática de cuentas bancarias",
        type: "control",
        priority: 8,
        keywords: [
            "crear cuenta bancaria",
            "cuenta bancaria automatica",
            "cuenta bancaria automática",
            "bbva no existe",
            "galicia no existe",
            "cuenta no existe",
            "nueva cuenta bancaria",
        ],
        answer:
            "Si al importar un extracto el banco detectado no existe como cuenta bancaria, el sistema puede crear automáticamente una cuenta como “BBVA”, “Banco Galicia” o “Banco Macro”. Así evita asignar el extracto a una cuenta incorrecta.",
        steps: [
            "Importá el extracto PDF.",
            "El sistema detecta el banco.",
            "Si la cuenta no existe, la crea automáticamente.",
            "Revisá que la cuenta asignada sea correcta.",
            "Confirmá la importación.",
        ],
        related: ["bancos-importar-extracto", "filtro-sede"],
    },
    {
        id: "conciliacion-manual",
        page: "bancos",
        label: "Bancos",
        title: "Conciliación manual",
        type: "operativo",
        priority: 8,
        keywords: [
            "conciliar",
            "conciliacion",
            "conciliación",
            "conciliacion manual",
            "conciliación manual",
            "vincular movimiento",
            "sin vincular",
            "movimiento sin vincular",
        ],
        answer:
            "La conciliación manual permite vincular un movimiento bancario con un ingreso o egreso pendiente. El sistema muestra candidatos por importe y fecha, y el usuario confirma el comprobante correcto.",
        steps: [
            "Entrá en “Bancos”.",
            "Buscá un movimiento sin vincular.",
            "Presioná la acción de conciliación.",
            "Seleccioná el ingreso o egreso correspondiente.",
            "Confirmá la conciliación.",
        ],
        related: ["conciliacion-automatica", "ingresos", "egresos"],
    },
    {
        id: "conciliacion-automatica",
        page: "bancos",
        label: "Bancos",
        title: "Conciliación automática",
        type: "operativo",
        priority: 10,
        keywords: [
            "conciliacion automatica",
            "conciliación automática",
            "conciliar automatico",
            "conciliar automático",
            "conciliar auto",
            "auto conciliacion",
            "auto conciliación",
            "automaticamente",
            "automáticamente",
        ],
        answer:
            "La conciliación automática busca coincidencias confiables entre movimientos bancarios e ingresos o egresos pendientes. Solo concilia cuando coinciden tipo, importe, fecha cercana y sede compatible. Si hay más de un candidato posible, lo marca como ambiguo y no lo aplica automáticamente.",
        steps: [
            "Entrá en “Bancos”.",
            "Presioná “Conciliar auto”.",
            "El sistema calcula coincidencias confiables.",
            "Confirmá la acción.",
            "Los movimientos aplicables quedan conciliados.",
            "Los casos ambiguos deben revisarse manualmente.",
        ],
        related: ["conciliacion-manual", "bancos-duplicados"],
    },
    {
        id: "documentos",
        page: "documentos",
        label: "Documentos",
        title: "Gestionar documentos",
        type: "operativo",
        priority: 5,
        keywords: [
            "documento",
            "documentos",
            "pdf",
            "comprobante",
            "comprobantes",
            "afip",
            "arca",
            "factura afip",
            "factura arca",
            "qr",
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
        related: ["human-in-the-loop", "ingresos", "egresos"],
    },
    {
        id: "human-in-the-loop",
        page: "documentos",
        label: "Documentos",
        title: "Revisión humana antes de confirmar",
        type: "control",
        priority: 7,
        keywords: [
            "human in the loop",
            "revision humana",
            "revisión humana",
            "validar datos",
            "confirmar datos",
            "corregir datos",
            "importacion asistida",
            "importación asistida",
        ],
        answer:
            "Las importaciones importantes trabajan con revisión humana. El sistema lee datos del PDF, propone una carga y el usuario revisa, corrige y confirma. Esto reduce errores en facturas, comprobantes y extractos bancarios.",
        steps: [
            "Importá el archivo.",
            "Revisá la vista previa.",
            "Corregí datos si hace falta.",
            "Confirmá solo cuando la información sea correcta.",
        ],
        related: ["documentos", "bancos-importar-extracto"],
    },
    {
        id: "reportes",
        page: "reportes",
        label: "Reportes",
        title: "Generar reportes",
        type: "operativo",
        priority: 4,
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
        related: ["dashboard", "filtro-sede"],
    },
    {
        id: "usuarios",
        page: "usuarios",
        label: "Usuarios",
        title: "Crear o administrar usuarios",
        type: "administracion",
        priority: 5,
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
        related: ["filtro-sede", "configuracion"],
    },
    {
        id: "filtro-sede",
        page: "dashboard",
        label: "Filtro por sede",
        title: "Usar el filtro de sedes",
        type: "control",
        priority: 7,
        keywords: [
            "filtro sede",
            "filtrar sede",
            "todas las sedes",
            "cambiar sede",
            "ver sede",
            "sede seleccionada",
            "administrador sede",
            "acceso sede",
            "sede id null",
            "sin sede",
        ],
        answer:
            "El filtro de sedes permite ver información de una sede específica o de todas las sedes. Los administradores pueden alternar entre sedes; los usuarios con acceso limitado solo ven la sede asignada. En bancos, algunos movimientos pueden quedar asociados a “Todas las sedes”.",
        steps: [
            "Buscá el selector de sede en el encabezado superior.",
            "Seleccioná “Todas las sedes” o una sede específica.",
            "El sistema actualizará los datos visibles según esa selección.",
            "Si el usuario tiene acceso limitado, la sede queda bloqueada.",
        ],
        related: ["dashboard", "usuarios", "bancos-cuentas-automaticas"],
    },
    {
        id: "dashboard",
        page: "dashboard",
        label: "Dashboard",
        title: "Usar el panel principal",
        type: "operativo",
        priority: 4,
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
        related: ["reportes", "filtro-sede"],
    },
    {
        id: "configuracion",
        page: "configuracion",
        label: "Configuración",
        title: "Configurar el sistema",
        type: "administracion",
        priority: 4,
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
        related: ["usuarios", "sedes"],
    },
    {
        id: "sedes",
        page: "sedes",
        label: "Sedes",
        title: "Administrar sedes",
        type: "administracion",
        priority: 4,
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
        related: ["filtro-sede", "usuarios"],
    },
];

const quickActions = [
    "Importar extracto PDF",
    "Conciliar auto",
    "Evitar duplicados",
    "Cargar paciente",
    "Registrar ingreso",
    "Registrar egreso",
    "Crear usuario",
    "Ver reportes",
];

const commandTopics = {
    "/bancos": "bancos",
    "/extractos": "bancos-importar-extracto",
    "/conciliar": "conciliacion-automatica",
    "/duplicados": "bancos-duplicados",
    "/documentos": "documentos",
    "/usuarios": "usuarios",
    "/sedes": "filtro-sede",
    "/reportes": "reportes",
};

const diagnostics = [
    {
        id: "pdf-no-lee",
        triggers: ["no lee pdf", "no lee el pdf", "no detecta pdf", "extracto no lee", "no importa pdf"],
        title: "Diagnóstico: el sistema no lee un PDF",
        answer:
            "Verificá primero que el archivo sea un PDF digital y no una imagen escaneada. La lectura actual no usa OCR. También confirmá que el extracto corresponda a un formato soportado: BBVA o Galicia.",
        steps: [
            "Abrí el PDF y probá seleccionar texto con el mouse.",
            "Si no se puede seleccionar texto, probablemente es escaneado.",
            "Verificá que sea BBVA o Galicia.",
            "Probá importar nuevamente desde “Bancos”.",
            "Si el formato cambió, hay que ajustar el parser del banco.",
        ],
        page: "bancos",
        label: "Bancos",
    },
    {
        id: "duplicados",
        triggers: ["duplicado", "se duplico", "se duplicó", "importo dos veces", "movimientos repetidos"],
        title: "Diagnóstico: movimientos duplicados",
        answer:
            "El sistema usa una huella única por movimiento para bloquear duplicados. Si ves duplicados, puede tratarse de movimientos cargados antes de activar el antiduplicado o de movimientos editados manualmente antes de guardar.",
        steps: [
            "Revisá si el movimiento tiene estado “Ya importado” en el preview.",
            "Verificá si fue cargado manualmente antes.",
            "Confirmá que la columna external_hash exista en Supabase.",
            "Si ya existe duplicado histórico, eliminá manualmente el movimiento sobrante.",
        ],
        page: "bancos",
        label: "Bancos",
    },
    {
        id: "conciliacion-no-encuentra",
        triggers: ["no concilia", "no encuentra comprobante", "conciliacion no", "conciliación no", "conciliar auto no"],
        title: "Diagnóstico: conciliación automática no encuentra candidatos",
        answer:
            "La conciliación automática es conservadora. Solo aplica si coinciden tipo, importe, fecha cercana y sede compatible. Si hay más de un candidato posible, lo deja para revisión manual.",
        steps: [
            "Revisá que el ingreso o egreso esté pendiente.",
            "Confirmá que el importe sea exactamente igual.",
            "Revisá que la fecha esté dentro del margen aceptado.",
            "Verificá que la sede sea compatible.",
            "Si hay varios candidatos iguales, conciliá manualmente.",
        ],
        page: "bancos",
        label: "Bancos",
    },
    {
        id: "sede-no-muestra",
        triggers: ["no veo sede", "no muestra sede", "filtro sede", "no aparecen datos", "dashboard vacio", "dashboard vacío"],
        title: "Diagnóstico: filtros por sede",
        answer:
            "Si no aparecen datos, revisá el filtro superior de sede. Algunos usuarios solo tienen acceso a una sede. En bancos, también pueden existir movimientos asociados a “Todas las sedes”.",
        steps: [
            "Revisá el selector superior de sede.",
            "Probá con “Todas las sedes” si tu usuario tiene permiso.",
            "Verificá que los registros tengan sede asociada o estén como generales.",
            "Si el usuario tiene acceso limitado, revisá permisos en “Usuarios”.",
        ],
        page: "dashboard",
        label: "Dashboard",
    },
];

function makeId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenize(text) {
    return normalizeText(text)
        .split(" ")
        .filter((word) => word.length >= 3);
}

function getTopicById(id) {
    return helpTopics.find((topic) => topic.id === id) || null;
}

function findDiagnostic(question) {
    const normalized = normalizeText(question);

    return diagnostics.find((diag) =>
        diag.triggers.some((trigger) => normalized.includes(normalizeText(trigger)))
    );
}

function scoreTopic(topic, question) {
    const normalizedQuestion = normalizeText(question);
    const questionTokens = tokenize(question);
    let score = 0;

    topic.keywords.forEach((keyword) => {
        const normalizedKeyword = normalizeText(keyword);

        if (normalizedQuestion.includes(normalizedKeyword)) {
            score += normalizedKeyword.length > 10 ? 8 : 5;
            return;
        }

        const keywordTokens = tokenize(keyword);
        keywordTokens.forEach((part) => {
            if (part.length > 3 && questionTokens.includes(part)) {
                score += 2;
            }
        });
    });

    if (topic.page && normalizedQuestion.includes(normalizeText(topic.page))) score += 3;
    if (topic.title && normalizeText(topic.title).split(" ").some((w) => questionTokens.includes(w))) score += 1;

    score += topic.priority || 0;

    return score;
}

function findBestTopics(question, limit = 3) {
    const normalizedQuestion = normalizeText(question);

    if (commandTopics[normalizedQuestion]) {
        const topic = getTopicById(commandTopics[normalizedQuestion]);
        return topic ? [{ topic, score: 999 }] : [];
    }

    return helpTopics
        .map((topic) => ({
            topic,
            score: scoreTopic(topic, question),
        }))
        .filter((item) => item.score > (item.topic.priority || 0))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

function buildTopicMessage(topic, relatedTopics = []) {
    return {
        id: makeId(),
        sender: "bot",
        kind: "topic",
        topic,
        relatedTopics,
        text: topic
            ? topic.answer
            : "No encontré una respuesta exacta. Probá consultando por: importar extracto PDF, conciliar auto, cargar paciente, registrar ingreso, registrar egreso, crear usuario, cambiar sede, documentos o reportes.",
    };
}

function buildDiagnosticMessage(diagnostic) {
    return {
        id: makeId(),
        sender: "bot",
        kind: "diagnostic",
        topic: {
            id: diagnostic.id,
            page: diagnostic.page,
            label: diagnostic.label,
            title: diagnostic.title,
            answer: diagnostic.answer,
            steps: diagnostic.steps,
        },
        relatedTopics: [],
        text: diagnostic.answer,
    };
}

function buildSystemMessage(text, relatedTopics = []) {
    return {
        id: makeId(),
        sender: "bot",
        kind: "system",
        relatedTopics,
        text,
    };
}

function getRelatedTopics(topic) {
    if (!topic?.related?.length) return [];

    return topic.related
        .map((id) => getTopicById(id))
        .filter(Boolean)
        .slice(0, 3);
}

function getContextualTopics(activePage) {
    if (!activePage) return [];

    return helpTopics
        .filter((topic) => topic.page === activePage)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, 4);
}

function loadStoredMessages() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;

        return parsed;
    } catch {
        return null;
    }
}

export default function HelpAssistant({ activePage, setActivePage }) {
    const storedMessages = useMemo(() => loadStoredMessages(), []);

    const [isOpen, setIsOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [messages, setMessages] = useState(
        storedMessages || [
            {
                id: makeId(),
                sender: "bot",
                kind: "welcome",
                text:
                    "Hola. Soy CEDIM-Bot, tu asistente operativo dentro del sistema. Puedo guiarte para cargar pacientes, registrar ingresos o egresos, importar extractos bancarios, conciliar movimientos, usar reportes, administrar usuarios y más.",
            },
        ]
    );

    const inputRef = useRef(null);

    const currentTopic = useMemo(
        () => helpTopics.find((topic) => topic.page === activePage),
        [activePage]
    );

    const contextualTopics = useMemo(
        () => getContextualTopics(activePage),
        [activePage]
    );

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
        } catch {
            // No bloquea la UI si localStorage no está disponible.
        }
    }, [messages]);

    const sendTopicDirect = (topic) => {
        if (!topic) return;

        const botMessage = buildTopicMessage(topic, getRelatedTopics(topic));
        setMessages((prevMessages) => [...prevMessages, botMessage]);
        setIsOpen(true);

        setTimeout(() => {
            inputRef.current?.focus();
        }, 50);
    };

    const sendQuestion = (value = question) => {
        const cleanQuestion = String(value || "").trim();

        if (!cleanQuestion) return;

        const userMessage = {
            id: makeId(),
            sender: "user",
            text: cleanQuestion,
        };

        const normalized = normalizeText(cleanQuestion);

        if (normalized === "/ayuda" || normalized === "/comandos") {
            const commandMessage = buildSystemMessage(
                "Comandos disponibles: /bancos, /extractos, /conciliar, /duplicados, /documentos, /usuarios, /sedes y /reportes."
            );
            setMessages((prevMessages) => [...prevMessages, userMessage, commandMessage]);
            setQuestion("");
            return;
        }

        if (normalized === "/atajos") {
            const related = quickActions
                .map((label) => findBestTopics(label, 1)[0]?.topic)
                .filter(Boolean);

            const shortcutsMessage = buildSystemMessage(
                "Atajos disponibles: importar extracto PDF, conciliar auto, evitar duplicados, cargar paciente, registrar ingreso, registrar egreso, crear usuario y ver reportes.",
                related
            );

            setMessages((prevMessages) => [...prevMessages, userMessage, shortcutsMessage]);
            setQuestion("");
            return;
        }

        const diagnostic = findDiagnostic(cleanQuestion);

        if (diagnostic) {
            setMessages((prevMessages) => [
                ...prevMessages,
                userMessage,
                buildDiagnosticMessage(diagnostic),
            ]);
            setQuestion("");
            return;
        }

        const results = findBestTopics(cleanQuestion, 3);
        const best = results[0]?.topic;

        if (!best) {
            const fallback = buildSystemMessage(
                "No encontré una respuesta exacta. Probá consultando por la pantalla o acción: Bancos, importar extracto, conciliación automática, Ingresos, Egresos, Documentos, Usuarios, Sedes o Reportes.",
                contextualTopics
            );
            setMessages((prevMessages) => [...prevMessages, userMessage, fallback]);
            setQuestion("");
            return;
        }

        const botMessage = buildTopicMessage(best, getRelatedTopics(best));

        if (results.length > 1) {
            botMessage.alternatives = results.slice(1).map((item) => item.topic);
        }

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
        const resetMessages = [
            {
                id: makeId(),
                sender: "bot",
                kind: "welcome",
                text: "Chat reiniciado. Escribí qué necesitás hacer dentro del sistema y te guío paso a paso. También podés usar /comandos o /atajos.",
            },
        ];

        setMessages(resetMessages);

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // No bloquea la UI.
        }
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
                title="Asistente CEDIM"
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

                        <line x1="60" y1="20" x2="60" y2="11" stroke="#0f172a" strokeWidth="5" strokeLinecap="round" />
                        <circle cx="60" cy="8" r="5" fill="#4dd6d0" />

                        <rect x="15" y="44" width="15" height="28" rx="8" fill="#0f172a" />
                        <rect x="90" y="44" width="15" height="28" rx="8" fill="#0f172a" />

                        <rect x="25" y="23" width="70" height="63" rx="24" fill="url(#doctorBotBody)" />

                        <path d="M37 28 C45 17, 75 17, 83 28 L83 40 L37 40 Z" fill="#ffffff" />
                        <path
                            d="M56 26 H64 V34 H72 V42 H64 V50 H56 V42 H48 V34 H56 Z"
                            fill="#ef4444"
                            opacity="0.95"
                            transform="scale(0.72) translate(23 7)"
                        />

                        <rect x="36" y="39" width="48" height="34" rx="17" fill="url(#doctorBotFace)" />

                        <circle cx="51" cy="56" r="5" fill="#0f172a" />
                        <circle cx="69" cy="56" r="5" fill="#0f172a" />
                        <circle cx="49" cy="54" r="1.5" fill="#ffffff" />
                        <circle cx="67" cy="54" r="1.5" fill="#ffffff" />

                        <path
                            d="M52 64 C56 69, 64 69, 68 64"
                            fill="none"
                            stroke="#0ea5c6"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />

                        <path
                            d="M35 83 H85 C91 83, 95 88, 95 95 V110 H25 V95 C25 88, 29 83, 35 83 Z"
                            fill="url(#doctorCoat)"
                        />

                        <path
                            d="M50 84 L60 96 L70 84"
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />

                        <path d="M43 86 L56 108" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
                        <path d="M77 86 L64 108" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />

                        <path
                            d="M45 88 C45 100, 53 104, 60 104 C67 104, 75 100, 75 88"
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />
                        <circle cx="45" cy="88" r="3.5" fill="#0f172a" />
                        <circle cx="75" cy="88" r="3.5" fill="#0f172a" />
                        <path d="M60 104 V111" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
                        <circle cx="60" cy="113" r="5" fill="#0ea5c6" stroke="#0f172a" strokeWidth="3" />

                        <rect x="70" y="96" width="13" height="10" rx="3" fill="#dff5fb" />
                        <path d="M73 101 H80" stroke="#0ea5c6" strokeWidth="2" strokeLinecap="round" />

                        <path d="M29 94 C20 94, 18 86, 20 80" fill="none" stroke="#0f172a" strokeWidth="8" strokeLinecap="round" />
                        <path d="M91 94 C100 94, 102 86, 100 80" fill="none" stroke="#0f172a" strokeWidth="8" strokeLinecap="round" />
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
                                <strong>CEDIM-Bot</strong>
                                <span>Asistencia operativa dentro del sistema</span>
                            </div>
                        </div>

                        <div className="help-assistant-actions">
                            <button type="button" onClick={resetChat} aria-label="Reiniciar chat" title="Reiniciar chat">
                                <RotateCcw size={16} />
                            </button>
                            <button type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar asistente" title="Cerrar">
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="help-assistant-body">
                        {currentTopic && (
                            <div className="help-context-card">
                                <span>Estás en</span>
                                <strong>{currentTopic.label}</strong>
                                <small>Podés preguntar cómo usar esta pantalla o elegir una acción frecuente.</small>
                            </div>
                        )}

                        {contextualTopics.length > 0 && (
                            <div className="help-context-actions">
                                {contextualTopics.map((topic) => (
                                    <button type="button" key={topic.id} onClick={() => sendTopicDirect(topic)}>
                                        <Lightbulb size={13} />
                                        {topic.title}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="help-quick-actions">
                            {quickActions.map((action) => (
                                <button type="button" key={action} onClick={() => sendQuestion(action)}>
                                    {action}
                                </button>
                            ))}
                        </div>

                        <div className="help-messages">
                            {messages.map((message) => (
                                <div key={message.id} className={`help-message ${message.sender}`}>
                                    {message.kind === "diagnostic" && (
                                        <div className="help-message-tag">
                                            <AlertTriangle size={13} />
                                            Diagnóstico
                                        </div>
                                    )}

                                    {message.kind === "topic" && message.topic?.title && (
                                        <div className="help-message-tag">
                                            <ClipboardList size={13} />
                                            {message.topic.title}
                                        </div>
                                    )}

                                    <p>{message.text}</p>

                                    {message.topic?.steps?.length > 0 && (
                                        <ol>
                                            {message.topic.steps.map((step) => (
                                                <li key={step}>{step}</li>
                                            ))}
                                        </ol>
                                    )}

                                    {message.alternatives?.length > 0 && (
                                        <div className="help-related">
                                            <span>También puede servir:</span>
                                            {message.alternatives.map((topic) => (
                                                <button type="button" key={topic.id} onClick={() => sendTopicDirect(topic)}>
                                                    {topic.title}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {message.relatedTopics?.length > 0 && (
                                        <div className="help-related">
                                            <span>Relacionado:</span>
                                            {message.relatedTopics.map((topic) => (
                                                <button type="button" key={topic.id} onClick={() => sendTopicDirect(topic)}>
                                                    {topic.title}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {message.topic?.page && (
                                        <button type="button" className="help-go-button" onClick={() => goToPage(message.topic.page)}>
                                            Ir a {message.topic.label}
                                            <ArrowRight size={15} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <form className="help-assistant-input" onSubmit={handleSubmit}>
                        <Search size={15} />
                        <input
                            ref={inputRef}
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            placeholder="Ej: /comandos, importar extracto, conciliar auto..."
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