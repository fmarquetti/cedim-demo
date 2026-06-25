import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowRight,
    ClipboardList,
    Lightbulb,
    MessageCircle,
    RotateCcw,
    Search,
    Send,
    X,
} from "lucide-react";
import { useAppConfig } from "../context/AppConfigContext";
import { canAccessInternalTools } from "../utils/internalAccess";
import { canViewPage } from "../utils/permissions";
import "./HelpAssistant.css";

const STORAGE_KEY = "cedim_help_assistant_messages_v3";

const helpTopics = [
    {
        id: "dashboard",
        page: "dashboard",
        label: "Dashboard",
        title: "Usar el Dashboard",
        type: "operativo",
        priority: 7,
        keywords: ["dashboard", "inicio", "panel", "indicadores", "metricas", "resumen", "actividad", "graficos", "kpi"],
        answer: "El Dashboard muestra el resumen operativo y financiero de CEDIM. Sirve para revisar indicadores, actividad reciente y datos filtrados por sede.",
        steps: ["Entrar en Dashboard.", "Revisar tarjetas e indicadores principales.", "Cambiar la sede desde el encabezado si corresponde.", "Abrir Reportes si necesitas un detalle exportable."],
        related: ["cambiar-sede", "reportes", "ingresos"],
    },
    {
        id: "ingresos",
        page: "ingresos",
        label: "Ingresos",
        title: "Cargar ingresos",
        type: "operativo",
        priority: 10,
        keywords: ["ingreso", "ingresos", "cobro", "cobros", "recibo", "venta", "factura", "medio de pago", "importe", "cargar ingresos", "registrar ingreso"],
        answer: "Ingresos permite registrar cobros y comprobantes asociados a la operatoria. Desde ahi se carga fecha, sede, concepto, medio de pago, estado e importe.",
        steps: ["Entrar en Ingresos.", "Usar el boton para agregar un ingreso.", "Completar fecha, sede, concepto, medio de pago e importe.", "Adjuntar o vincular comprobante si corresponde.", "Guardar el registro.", "Conciliarlo desde Bancos cuando aparezca el movimiento bancario."],
        related: ["bancos-conciliacion", "documentos", "facturacion"],
    },
    {
        id: "egresos",
        page: "egresos",
        label: "Egresos",
        title: "Cargar egresos",
        type: "operativo",
        priority: 9,
        keywords: ["egreso", "egresos", "gasto", "gastos", "compra", "proveedor", "pago proveedor", "factura proveedor", "registrar egreso"],
        answer: "Egresos concentra gastos, compras y pagos a proveedores. Se usa para cargar comprobantes, importes, conceptos, sede y estado de pago.",
        steps: ["Entrar en Egresos.", "Agregar un nuevo egreso.", "Seleccionar proveedor, sede, fecha y concepto.", "Cargar importe y datos del comprobante.", "Guardar.", "Conciliar el pago desde Bancos si corresponde."],
        related: ["ordenes-pago", "bancos-conciliacion", "cuentas-entidades"],
    },
    {
        id: "ordenes-pago",
        page: "ordenesPago",
        label: "Ordenes de Pago",
        title: "Gestionar ordenes de pago",
        type: "operativo",
        priority: 8,
        keywords: ["orden de pago", "ordenes de pago", "op", "autorizar pago", "pagar proveedor", "pdf orden"],
        answer: "Ordenes de Pago permite preparar, controlar y documentar pagos a proveedores antes de registrarlos o conciliarlos.",
        steps: ["Entrar en Ordenes de Pago.", "Crear una nueva orden.", "Seleccionar proveedor, comprobantes o conceptos a pagar.", "Revisar importes y medio de pago.", "Guardar o emitir el PDF si la pantalla lo permite.", "Registrar o conciliar el egreso relacionado."],
        related: ["egresos", "cuentas-entidades", "bancos-conciliacion"],
    },
    {
        id: "cuentas",
        page: "cuentas",
        label: "Cuentas corrientes",
        title: "Consultar cuentas corrientes",
        type: "finanzas",
        priority: 8,
        keywords: ["cuenta corriente", "cuentas corrientes", "saldo", "saldos", "deuda", "pendiente", "movimientos de cuenta"],
        answer: "Cuentas corrientes muestra saldos y movimientos pendientes o aplicados. Es la vista para controlar deuda, cobros y pagos por cuenta.",
        steps: ["Entrar en Cuentas corrientes.", "Filtrar por sede, periodo o estado.", "Revisar saldos y movimientos.", "Abrir el comprobante o registro relacionado.", "Aplicar ajustes solo si tu permiso lo permite."],
        related: ["ingresos", "egresos", "cuentas-entidades"],
    },
    {
        id: "cuentas-entidades",
        page: "cuentasCorrientesEntidades",
        label: "CC Clientes/Proveedores",
        title: "Controlar clientes y proveedores",
        type: "finanzas",
        priority: 8,
        keywords: ["cliente", "clientes", "proveedor", "proveedores", "cc clientes", "cc proveedores", "entidades", "saldo proveedor", "saldo cliente"],
        answer: "CC Clientes/Proveedores permite revisar la cuenta corriente por entidad, separando saldos, movimientos y comprobantes vinculados a clientes o proveedores.",
        steps: ["Entrar en CC Clientes/Proveedores.", "Buscar la entidad.", "Filtrar movimientos por fecha o estado.", "Revisar saldo y comprobantes relacionados.", "Usar Ingresos, Egresos u Ordenes de Pago para completar operaciones pendientes."],
        related: ["cuentas", "ingresos", "ordenes-pago"],
    },
    {
        id: "bancos",
        page: "bancos",
        label: "Bancos",
        title: "Consultar bancos",
        type: "finanzas",
        priority: 9,
        keywords: ["banco", "bancos", "cuenta bancaria", "cuentas bancarias", "movimiento bancario", "saldo bancario", "cbu", "galicia", "bbva", "macro"],
        answer: "Bancos muestra cuentas, saldos, movimientos importados y estado de conciliacion. Es la pantalla central para controlar extractos y vincular movimientos con ingresos o egresos.",
        steps: ["Entrar en Bancos.", "Revisar cuentas y movimientos.", "Filtrar por cuenta, sede, fecha o estado.", "Importar extractos si tenes un PDF digital.", "Conciliar movimientos pendientes."],
        related: ["bancos-importar-extractos", "bancos-conciliacion", "importaciones"],
    },
    {
        id: "bancos-conciliacion",
        page: "bancos",
        label: "Bancos",
        title: "Conciliar bancos",
        type: "finanzas",
        priority: 10,
        keywords: ["conciliar", "conciliacion", "conciliacion bancaria", "conciliar bancos", "conciliar auto", "movimiento sin vincular", "vincular movimiento"],
        answer: "La conciliacion vincula movimientos bancarios con ingresos o egresos pendientes. La conciliacion automatica aplica solo coincidencias confiables; los casos ambiguos se revisan manualmente.",
        steps: ["Entrar en Bancos.", "Filtrar movimientos pendientes o sin vincular.", "Usar Conciliar auto si esta disponible.", "Revisar las coincidencias propuestas.", "Confirmar las coincidencias confiables.", "Conciliar manualmente los movimientos ambiguos."],
        related: ["ingresos", "egresos", "bancos-importar-extractos"],
    },
    {
        id: "bancos-importar-extractos",
        page: "bancos",
        label: "Bancos",
        title: "Importar extractos",
        type: "finanzas",
        priority: 10,
        keywords: ["extracto", "extractos", "importar extracto", "subir extracto", "pdf banco", "pdf bancario", "bbva", "galicia", "movimientos importados"],
        answer: "Los extractos bancarios se importan desde Bancos. El sistema lee PDFs digitales soportados, muestra una vista previa editable y bloquea duplicados antes de confirmar.",
        steps: ["Entrar en Bancos.", "Presionar Importar extracto PDF.", "Seleccionar el PDF digital del banco.", "Revisar banco, cuenta, CBU, sede y movimientos detectados.", "Corregir datos si hace falta.", "Confirmar la importacion de movimientos nuevos."],
        related: ["bancos-conciliacion", "documentos", "importaciones"],
    },
    {
        id: "reportes",
        page: "reportes",
        label: "Reportes",
        title: "Generar reportes",
        type: "analisis",
        priority: 8,
        keywords: ["reporte", "reportes", "informe", "informes", "exportar", "excel", "pdf", "resumen", "periodo", "analisis"],
        answer: "Reportes permite consultar informacion consolidada y exportable. Se usa para analizar gestion, movimientos, saldos y resultados segun filtros disponibles.",
        steps: ["Entrar en Reportes.", "Elegir tipo de reporte.", "Aplicar filtros de sede, fechas o estado.", "Revisar la informacion generada.", "Exportar si la pantalla ofrece esa accion."],
        related: ["dashboard", "contabilidad", "iva"],
    },
    {
        id: "panel-contador",
        page: "panelContador",
        label: "Panel del Contador",
        title: "Usar el Panel del Contador",
        type: "contabilidad",
        priority: 9,
        keywords: ["panel contador", "contador", "panel del contador", "resumen contable", "control fiscal", "contabilidad fiscal"],
        answer: "El Panel del Contador centraliza alertas, estados y accesos de contabilidad fiscal para revisar rapidamente la salud contable del periodo.",
        steps: ["Entrar en Panel del Contador.", "Revisar indicadores y alertas.", "Abrir Contabilidad, IVA o Auditoria segun el caso.", "Resolver pendientes antes de cerrar periodos o ejercicio."],
        related: ["contabilidad-fiscal", "iva", "auditoria-contable"],
    },
    {
        id: "contabilidad-fiscal",
        page: "contabilidad",
        label: "Contabilidad",
        title: "Usar contabilidad fiscal",
        type: "contabilidad",
        priority: 10,
        keywords: ["contabilidad", "contabilidad fiscal", "libro diario", "mayor", "plan de cuentas", "asientos", "imputacion", "fiscal"],
        answer: "Contabilidad muestra la informacion fiscal y contable generada por la plataforma. Desde ahi se revisan asientos, cuentas, imputaciones y consistencia contable.",
        steps: ["Entrar en Contabilidad.", "Seleccionar periodo o filtros disponibles.", "Revisar asientos y cuentas.", "Corregir origenes operativos o crear asientos manuales si corresponde.", "Usar Auditoria Contable para detectar inconsistencias."],
        related: ["asientos-manuales", "periodos-contables", "auditoria-contable"],
    },
    {
        id: "asientos-manuales",
        page: "asientosManuales",
        label: "Asientos Manuales",
        title: "Crear asientos manuales",
        type: "contabilidad",
        priority: 8,
        keywords: ["asiento manual", "asientos manuales", "debe", "haber", "ajuste contable", "registrar asiento"],
        answer: "Asientos Manuales permite cargar ajustes contables que no nacen automaticamente de ingresos, egresos u otros modulos.",
        steps: ["Entrar en Asientos Manuales.", "Crear un nuevo asiento.", "Seleccionar fecha, periodo y descripcion.", "Cargar lineas de debe y haber.", "Verificar que el asiento balancee.", "Guardar."],
        related: ["contabilidad-fiscal", "saldos-iniciales", "auditoria-contable"],
    },
    {
        id: "saldos-iniciales",
        page: "saldosIniciales",
        label: "Saldos Iniciales",
        title: "Cargar saldos iniciales",
        type: "contabilidad",
        priority: 8,
        keywords: ["saldo inicial", "saldos iniciales", "apertura", "inicio ejercicio", "balance inicial"],
        answer: "Saldos Iniciales define la apertura contable de cuentas antes de operar un periodo o ejercicio.",
        steps: ["Entrar en Saldos Iniciales.", "Seleccionar periodo, ejercicio o cuenta segun corresponda.", "Cargar importes iniciales.", "Verificar que la apertura sea consistente.", "Guardar y revisar en Contabilidad."],
        related: ["periodos-contables", "contabilidad-fiscal", "cierre-ejercicio"],
    },
    {
        id: "periodos-contables",
        page: "periodosContables",
        label: "Periodos Contables",
        title: "Administrar periodos contables",
        type: "contabilidad",
        priority: 8,
        keywords: ["periodo contable", "periodos contables", "mes contable", "abrir periodo", "cerrar periodo", "bloquear periodo"],
        answer: "Periodos Contables permite abrir, revisar o cerrar periodos para ordenar la registracion fiscal.",
        steps: ["Entrar en Periodos Contables.", "Seleccionar ejercicio o periodo.", "Revisar estado del periodo.", "Abrir o cerrar segun corresponda y tus permisos.", "Verificar efectos en Contabilidad y Cierre de Ejercicio."],
        related: ["contabilidad-fiscal", "cierre-ejercicio", "auditoria-contable"],
    },
    {
        id: "cierre-ejercicio",
        page: "cierreEjercicio",
        label: "Cierre de Ejercicio",
        title: "Cerrar ejercicio",
        type: "contabilidad",
        priority: 8,
        keywords: ["cierre ejercicio", "cerrar ejercicio", "ejercicio contable", "resultado ejercicio", "cierre anual"],
        answer: "Cierre de Ejercicio guia el cierre contable anual. Antes de usarlo conviene revisar periodos, auditoria, saldos y asientos pendientes.",
        steps: ["Entrar en Cierre de Ejercicio.", "Seleccionar el ejercicio.", "Revisar validaciones y pendientes.", "Resolver inconsistencias detectadas.", "Confirmar el cierre si todo esta correcto."],
        related: ["periodos-contables", "auditoria-contable", "saldos-iniciales"],
    },
    {
        id: "auditoria-contable",
        page: "auditoriaContable",
        label: "Auditoria Contable",
        title: "Auditar contabilidad",
        type: "control",
        priority: 9,
        keywords: ["auditoria contable", "auditar", "inconsistencia", "validacion contable", "errores contables", "control contable"],
        answer: "Auditoria Contable ayuda a detectar inconsistencias, asientos desbalanceados, registros sin imputacion o diferencias antes de presentar informacion fiscal.",
        steps: ["Entrar en Auditoria Contable.", "Elegir periodo o alcance.", "Ejecutar o revisar controles.", "Abrir los casos observados.", "Corregir el origen o registrar ajustes.", "Consultar Historial de Auditoria para seguimiento."],
        related: ["historial-auditoria", "contabilidad-fiscal", "asientos-manuales"],
    },
    {
        id: "historial-auditoria",
        page: "historialAuditoria",
        label: "Historial de Auditoria",
        title: "Consultar historial de auditoria",
        type: "control",
        priority: 7,
        keywords: ["historial auditoria", "historial de auditoria", "eventos", "log", "cambios", "trazabilidad", "quien cambio"],
        answer: "Historial de Auditoria muestra eventos y cambios relevantes para trazabilidad. Sirve para revisar acciones realizadas y su contexto.",
        steps: ["Entrar en Historial de Auditoria.", "Filtrar por fecha, usuario, modulo o tipo de evento.", "Revisar el detalle del cambio.", "Usar esa informacion para controles internos o soporte."],
        related: ["auditoria-contable", "usuarios", "configuracion"],
    },
    {
        id: "importaciones",
        page: "importaciones",
        label: "Importaciones",
        title: "Gestionar importaciones",
        type: "operativo",
        priority: 8,
        keywords: ["importacion", "importaciones", "importar", "archivo", "csv", "excel", "lote", "carga masiva", "datos externos"],
        answer: "Importaciones concentra cargas asistidas o masivas disponibles en la plataforma. Permite revisar datos antes de incorporarlos definitivamente.",
        steps: ["Entrar en Importaciones.", "Elegir el tipo de importacion.", "Seleccionar archivo o fuente.", "Revisar la vista previa y errores.", "Corregir datos si hace falta.", "Confirmar la carga."],
        related: ["bancos-importar-extractos", "documentos", "contabilidad-fiscal"],
    },
    {
        id: "iva",
        page: "iva",
        label: "IVA",
        title: "Revisar IVA",
        type: "contabilidad",
        priority: 8,
        keywords: ["iva", "debito fiscal", "credito fiscal", "libro iva", "impuesto", "alicuota", "percepcion", "retencion"],
        answer: "IVA permite revisar informacion fiscal relacionada con debitos, creditos, alicuotas y comprobantes alcanzados.",
        steps: ["Entrar en IVA.", "Seleccionar periodo o filtros.", "Revisar debito y credito fiscal.", "Controlar comprobantes observados.", "Usar Reportes o Contabilidad para detalle complementario."],
        related: ["configuracion-fiscal", "facturacion", "contabilidad-fiscal"],
    },
    {
        id: "configuracion-fiscal",
        page: "configuracionFiscal",
        label: "Configuracion Fiscal",
        title: "Configurar datos fiscales",
        type: "administracion",
        priority: 8,
        keywords: ["configuracion fiscal", "arca", "afip", "cuit", "punto de venta", "condicion iva", "datos fiscales", "certificado"],
        answer: "Configuracion Fiscal centraliza parametros necesarios para facturacion, IVA y contabilidad fiscal, como datos fiscales, puntos de venta o integraciones disponibles.",
        steps: ["Entrar en Configuracion Fiscal.", "Revisar datos fiscales de la entidad.", "Configurar puntos de venta o parametros disponibles.", "Guardar cambios.", "Probar facturacion o reportes fiscales si corresponde."],
        related: ["facturacion", "iva", "contabilidad-fiscal"],
    },
    {
        id: "documentos",
        page: "documentos",
        label: "Documentos",
        title: "Gestionar documentos",
        type: "operativo",
        priority: 8,
        keywords: ["documento", "documentos", "archivo", "pdf", "comprobante", "adjuntar", "validar", "qr", "factura pdf"],
        answer: "Documentos permite cargar, revisar y validar archivos o comprobantes vinculados a operaciones de la plataforma.",
        steps: ["Entrar en Documentos.", "Cargar o seleccionar el archivo.", "Revisar datos detectados o asociados.", "Corregir informacion si corresponde.", "Confirmar la carga o vinculacion."],
        related: ["ingresos", "egresos", "facturacion"],
    },
    {
        id: "facturacion",
        page: "facturacion",
        label: "Facturacion",
        title: "Emitir y revisar facturacion",
        type: "fiscal",
        priority: 8,
        keywords: ["facturacion", "factura", "facturar", "arca", "afip", "cae", "nota credito", "nota debito", "comprobante fiscal"],
        answer: "Facturacion permite gestionar comprobantes fiscales y su relacion con ingresos, documentos e informacion fiscal configurada.",
        steps: ["Entrar en Facturacion.", "Crear o revisar el comprobante.", "Completar cliente, concepto, importes e impuestos.", "Emitir o guardar segun el flujo disponible.", "Verificar el comprobante en Documentos, IVA o Contabilidad."],
        related: ["configuracion-fiscal", "iva", "ingresos"],
    },
    {
        id: "pacientes",
        page: "pacientes",
        label: "Pacientes y estudios",
        title: "Gestionar pacientes y estudios",
        type: "operativo",
        priority: 8,
        keywords: ["paciente", "pacientes", "estudio", "estudios", "muestra", "orden medica", "analisis", "laboratorio", "cargar paciente"],
        answer: "Pacientes y estudios permite registrar pacientes, cargar estudios, controlar estados y consultar el avance de cada trabajo medico.",
        steps: ["Entrar en Pacientes y estudios.", "Crear o buscar el paciente.", "Cargar datos del estudio y sede.", "Actualizar prioridad o estado segun avance.", "Guardar los cambios."],
        related: ["turnos", "ingresos", "documentos"],
    },
    {
        id: "turnos",
        page: "turnos",
        label: "Turnos",
        title: "Gestionar turnos",
        type: "operativo",
        priority: 7,
        keywords: ["turno", "turnos", "agenda", "cita", "horario", "reservar turno", "programar"],
        answer: "Turnos permite organizar agenda, horarios y atencion de pacientes segun la operatoria disponible.",
        steps: ["Entrar en Turnos.", "Buscar fecha, sede o paciente.", "Crear o modificar el turno.", "Confirmar horario y datos de contacto.", "Guardar los cambios."],
        related: ["pacientes", "cambiar-sede", "dashboard"],
    },
    {
        id: "sedes",
        page: "sedes",
        label: "Sociedades / Sedes",
        title: "Administrar sociedades y sedes",
        type: "administracion",
        priority: 8,
        keywords: ["sede", "sedes", "sociedad", "sociedades", "sucursal", "empresa", "centro", "alta sede", "editar sede"],
        answer: "Sociedades / Sedes permite administrar las entidades operativas de CEDIM y su informacion de uso interno.",
        steps: ["Entrar en Sociedades / Sedes.", "Revisar el listado.", "Crear o editar una sede si tenes permiso.", "Completar datos requeridos.", "Guardar."],
        related: ["cambiar-sede", "usuarios", "configuracion"],
    },
    {
        id: "cambiar-sede",
        page: "dashboard",
        label: "Dashboard",
        title: "Cambiar de sede",
        type: "control",
        priority: 10,
        keywords: ["cambiar sede", "seleccionar sede", "filtro sede", "todas las sedes", "ver otra sede", "sede asignada", "no veo sede"],
        answer: "La sede se cambia desde el selector del encabezado superior. Los usuarios con acceso a una sola sede no pueden alternar: el sistema fija su sede asignada.",
        steps: ["Buscar el selector de sede en el encabezado.", "Elegir Todas las sedes o una sede especifica.", "Esperar que la pantalla actualice los datos.", "Si el selector esta bloqueado, revisar el acceso del usuario desde Usuarios."],
        related: ["usuarios-permisos", "sedes", "dashboard"],
    },
    {
        id: "usuarios",
        page: "usuarios",
        label: "Usuarios",
        title: "Crear usuarios",
        type: "administracion",
        priority: 10,
        keywords: ["usuario", "usuarios", "crear usuario", "nuevo usuario", "alta usuario", "email", "rol", "contrasena", "activar usuario"],
        answer: "Usuarios permite crear cuentas, asignar rol, estado, sede y permisos. Es la pantalla para controlar quien accede a cada modulo.",
        steps: ["Entrar en Usuarios.", "Presionar el boton para agregar usuario.", "Completar nombre, email, rol y estado.", "Definir acceso a una sede o a todas.", "Guardar.", "Configurar permisos especificos si no es Administrador."],
        related: ["usuarios-permisos", "cambiar-sede", "historial-auditoria"],
    },
    {
        id: "usuarios-permisos",
        page: "usuarios",
        label: "Usuarios",
        title: "Configurar permisos",
        type: "administracion",
        priority: 10,
        keywords: ["permiso", "permisos", "configurar permisos", "rol", "roles", "ver modulo", "crear editar eliminar", "sin permiso", "acceso"],
        answer: "Los permisos se configuran desde Usuarios. Un Administrador tiene acceso total; otros roles reciben permisos por modulo y accion.",
        steps: ["Entrar en Usuarios.", "Seleccionar el usuario.", "Abrir la edicion de permisos.", "Marcar Ver, Crear, Editar o Eliminar segun corresponda.", "Guardar cambios.", "Pedir al usuario que vuelva a ingresar si no ve los cambios."],
        related: ["usuarios", "configuracion", "historial-auditoria"],
    },
    {
        id: "configuracion",
        page: "configuracion",
        label: "Configuracion",
        title: "Configurar la plataforma",
        type: "administracion",
        priority: 8,
        keywords: ["configuracion", "ajustes", "parametros", "plataforma", "menu", "ocultar modulo", "logo", "nombre plataforma"],
        answer: "Configuracion concentra ajustes generales de la plataforma, identidad visual y opciones administrativas como visibilidad de modulos.",
        steps: ["Entrar en Configuracion.", "Revisar la seccion que necesitas cambiar.", "Modificar parametros, textos, imagenes o visibilidad de menu.", "Guardar cambios.", "Validar el resultado en Sidebar o Login si aplica."],
        related: ["usuarios-permisos", "sedes", "configuracion-fiscal"],
    },
    {
        id: "tickets",
        page: "tickets",
        label: "Tickets",
        title: "Cargar tickets",
        type: "soporte",
        priority: 10,
        keywords: ["ticket", "tickets", "soporte", "incidente", "problema", "reclamo", "cargar ticket", "mesa de ayuda", "pedido"],
        answer: "Tickets permite registrar pedidos de soporte, incidentes o mejoras. Los administradores pueden gestionar el estado y seguimiento.",
        steps: ["Entrar en Tickets.", "Crear un nuevo ticket.", "Completar asunto, descripcion y prioridad si esta disponible.", "Adjuntar contexto o capturas si corresponde.", "Guardar.", "Revisar el estado desde la misma pantalla."],
        related: ["historial-auditoria", "usuarios", "configuracion"],
    },
    {
        id: "propuestas-comerciales",
        page: "propuestasComerciales",
        label: "Propuestas",
        title: "Gestionar propuestas comerciales",
        type: "interno",
        priority: 4,
        keywords: ["propuesta", "propuestas", "comercial", "presupuesto", "demo", "pdf propuesta"],
        answer: "Propuestas es una herramienta interna para armar o revisar propuestas comerciales. Solo aparece para usuarios con acceso interno habilitado.",
        steps: ["Entrar en Propuestas.", "Crear o seleccionar una propuesta.", "Completar datos comerciales.", "Generar o revisar el documento disponible.", "Compartirlo segun el proceso interno."],
        related: ["configuracion", "usuarios"],
    },
];

const quickActions = [
    { label: "Cambiar sede", query: "como cambiar de sede", page: "dashboard" },
    { label: "Cargar ingreso", query: "como cargar ingresos", page: "ingresos" },
    { label: "Conciliar bancos", query: "como conciliar bancos", page: "bancos" },
    { label: "Importar extractos", query: "como importar extractos", page: "bancos" },
    { label: "Crear usuarios", query: "como crear usuarios", page: "usuarios" },
    { label: "Configurar permisos", query: "como configurar permisos", page: "usuarios" },
    { label: "Cargar tickets", query: "como cargar tickets", page: "tickets" },
    { label: "Contabilidad fiscal", query: "como usar contabilidad fiscal", page: "contabilidad" },
];

const commandTopics = {
    "/bancos": "bancos",
    "/extractos": "bancos-importar-extractos",
    "/conciliar": "bancos-conciliacion",
    "/contabilidad": "contabilidad-fiscal",
    "/iva": "iva",
    "/documentos": "documentos",
    "/usuarios": "usuarios",
    "/permisos": "usuarios-permisos",
    "/sedes": "cambiar-sede",
    "/tickets": "tickets",
    "/reportes": "reportes",
};

const diagnostics = [
    {
        id: "pdf-no-lee",
        triggers: ["no lee pdf", "no detecta pdf", "extracto no lee", "no importa pdf", "pdf escaneado"],
        title: "Diagnostico: el sistema no lee un PDF",
        answer: "Verifica que el archivo sea un PDF digital y que el formato este soportado por la pantalla usada. Un PDF escaneado necesita carga manual o conversion previa.",
        steps: ["Abrir el PDF y probar seleccionar texto.", "Si no se puede seleccionar texto, probablemente es escaneado.", "Confirmar que el banco o comprobante sea soportado.", "Intentar nuevamente desde Bancos, Documentos o Importaciones segun corresponda."],
        page: "bancos",
        label: "Bancos",
    },
    {
        id: "conciliacion-no-encuentra",
        triggers: ["no concilia", "no encuentra comprobante", "conciliacion no", "conciliar auto no", "no vincula"],
        title: "Diagnostico: conciliacion sin candidatos",
        answer: "La conciliacion automatica es conservadora. Puede no aplicar si el importe no coincide, la fecha esta lejos, la sede no corresponde o hay mas de un candidato posible.",
        steps: ["Revisar que el ingreso o egreso este pendiente.", "Comparar importe exacto.", "Verificar fecha y sede.", "Si hay varios candidatos similares, usar conciliacion manual."],
        page: "bancos",
        label: "Bancos",
    },
    {
        id: "sede-no-muestra",
        triggers: ["no veo sede", "no muestra sede", "no aparecen datos", "dashboard vacio", "filtro sede"],
        title: "Diagnostico: filtro por sede",
        answer: "Si no aparecen datos, revisa el selector de sede del encabezado. Los usuarios con acceso limitado solo ven su sede asignada.",
        steps: ["Revisar el selector superior de sede.", "Probar Todas las sedes si tu usuario tiene permiso.", "Verificar que los registros tengan sede asociada.", "Revisar permisos y alcance del usuario desde Usuarios."],
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

function scoreTopic(topic, question) {
    const normalizedQuestion = normalizeText(question);
    const questionTokens = tokenize(question);
    let score = topic.priority || 0;

    [...topic.keywords, topic.label, topic.title, topic.page].filter(Boolean).forEach((keyword) => {
        const normalizedKeyword = normalizeText(keyword);
        if (!normalizedKeyword) return;

        if (normalizedQuestion.includes(normalizedKeyword)) {
            score += normalizedKeyword.length > 10 ? 8 : 5;
            return;
        }

        tokenize(keyword).forEach((part) => {
            if (part.length > 3 && questionTokens.includes(part)) score += 2;
        });
    });

    return score;
}

function loadStoredMessages() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function buildSystemMessage(text, relatedTopics = []) {
    return { id: makeId(), sender: "bot", kind: "system", relatedTopics, text };
}

function buildTopicMessage(topic, relatedTopics = []) {
    return {
        id: makeId(),
        sender: "bot",
        kind: "topic",
        topic,
        relatedTopics,
        text: topic.answer,
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

export default function HelpAssistant({ activePage, setActivePage, currentUser }) {
    const { config } = useAppConfig();
    const storedMessages = useMemo(() => loadStoredMessages(), []);
    const [isOpen, setIsOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [messages, setMessages] = useState(
        storedMessages || [
            {
                id: makeId(),
                sender: "bot",
                kind: "welcome",
                text: "Hola. Soy CEDIM-Bot, tu asistente local. Puedo guiarte segun las pantallas que tu usuario tiene habilitadas.",
            },
        ]
    );
    const inputRef = useRef(null);

    const hiddenMenuItems = useMemo(
        () => (Array.isArray(config.hiddenMenuItems) ? config.hiddenMenuItems : []),
        [config.hiddenMenuItems]
    );

    const canUseTopic = useCallback((topic) => {
        if (!topic?.page || !currentUser) return false;
        if (topic.page === "propuestasComerciales") return canAccessInternalTools(currentUser);
        if (hiddenMenuItems.includes(topic.page)) return false;
        return canViewPage(currentUser, topic.page);
    }, [currentUser, hiddenMenuItems]);

    const allowedTopics = useMemo(
        () => helpTopics.filter(canUseTopic),
        [canUseTopic]
    );

    const allowedQuickActions = useMemo(
        () => quickActions.filter((action) => allowedTopics.some((topic) => topic.page === action.page)),
        [allowedTopics]
    );

    const getTopicById = (id) => allowedTopics.find((topic) => topic.id === id) || null;

    const getRelatedTopics = (topic) => {
        if (!topic?.related?.length) return [];
        return topic.related.map(getTopicById).filter(Boolean).slice(0, 3);
    };

    const findDiagnostic = (value) => {
        const normalized = normalizeText(value);
        return diagnostics.find((diag) => {
            const diagnosticTopic = { page: diag.page };
            return canUseTopic(diagnosticTopic) && diag.triggers.some((trigger) => normalized.includes(normalizeText(trigger)));
        });
    };

    const findBestTopics = (value, limit = 3) => {
        const normalized = normalizeText(value);

        if (commandTopics[normalized]) {
            const topic = getTopicById(commandTopics[normalized]);
            return topic ? [{ topic, score: 999 }] : [];
        }

        return allowedTopics
            .map((topic) => ({ topic, score: scoreTopic(topic, value) }))
            .filter((item) => item.score > (item.topic.priority || 0))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    };

    const contextualTopics = useMemo(
        () =>
            allowedTopics
                .filter((topic) => topic.page === activePage)
                .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                .slice(0, 4),
        [activePage, allowedTopics]
    );

    const currentTopic = contextualTopics[0] || null;

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
        } catch {
            // No bloquea la UI si localStorage no esta disponible.
        }
    }, [messages]);

    const sendTopicDirect = (topic) => {
        if (!topic || !canUseTopic(topic)) return;

        setMessages((prevMessages) => [
            ...prevMessages,
            buildTopicMessage(topic, getRelatedTopics(topic)),
        ]);
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const sendQuestion = (value = question) => {
        const cleanQuestion = String(value || "").trim();
        if (!cleanQuestion) return;

        const userMessage = { id: makeId(), sender: "user", text: cleanQuestion };
        const normalized = normalizeText(cleanQuestion);

        if (normalized === "/ayuda" || normalized === "/comandos") {
            const availableCommands = Object.entries(commandTopics)
                .filter(([, topicId]) => getTopicById(topicId))
                .map(([command]) => command)
                .join(", ");
            const text = availableCommands
                ? `Comandos disponibles para tu usuario: ${availableCommands}.`
                : "No hay comandos disponibles para tu usuario.";
            setMessages((prevMessages) => [...prevMessages, userMessage, buildSystemMessage(text)]);
            setQuestion("");
            return;
        }

        if (normalized === "/atajos") {
            const related = allowedQuickActions
                .map((action) => findBestTopics(action.query, 1)[0]?.topic)
                .filter(Boolean);
            const labels = allowedQuickActions.map((action) => action.label).join(", ");
            setMessages((prevMessages) => [
                ...prevMessages,
                userMessage,
                buildSystemMessage(`Atajos disponibles para tu usuario: ${labels || "ninguno"}.`, related),
            ]);
            setQuestion("");
            return;
        }

        const diagnostic = findDiagnostic(cleanQuestion);
        if (diagnostic) {
            setMessages((prevMessages) => [...prevMessages, userMessage, buildDiagnosticMessage(diagnostic)]);
            setQuestion("");
            return;
        }

        const results = findBestTopics(cleanQuestion, 3);
        const best = results[0]?.topic;

        if (!best) {
            const fallback = buildSystemMessage(
                "No encontre una respuesta exacta dentro de tus permisos. Proba preguntar por una pantalla visible del menu o por una accion concreta.",
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
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const resetChat = () => {
        const resetMessages = [
            {
                id: makeId(),
                sender: "bot",
                kind: "welcome",
                text: "Chat reiniciado. Escribi que necesitas hacer dentro del sistema y te guio paso a paso. Tambien podes usar /comandos o /atajos.",
            },
        ];

        setMessages(resetMessages);

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // No bloquea la UI.
        }
    };

    const goToPage = (topic) => {
        if (!topic?.page || !setActivePage || !canUseTopic(topic)) return;
        setActivePage(topic.page);
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
                <span className="help-bot-tooltip">Necesitas ayuda?</span>
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
                                <span>Estas en</span>
                                <strong>{currentTopic.label}</strong>
                                <small>Podes preguntar como usar esta pantalla o elegir una accion frecuente.</small>
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

                        {allowedQuickActions.length > 0 && (
                            <div className="help-quick-actions">
                                {allowedQuickActions.map((action) => (
                                    <button type="button" key={action.label} onClick={() => sendQuestion(action.query)}>
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="help-messages">
                            {messages.map((message) => {
                                const messageTopicAllowed = message.topic && canUseTopic(message.topic);
                                const alternatives = (message.alternatives || []).filter(canUseTopic);
                                const relatedTopics = (message.relatedTopics || []).filter(canUseTopic);

                                return (
                                    <div key={message.id} className={`help-message ${message.sender}`}>
                                        {message.kind === "diagnostic" && (
                                            <div className="help-message-tag">
                                                <AlertTriangle size={13} />
                                                Diagnostico
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

                                        {alternatives.length > 0 && (
                                            <div className="help-related">
                                                <span>Tambien puede servir:</span>
                                                {alternatives.map((topic) => (
                                                    <button type="button" key={topic.id} onClick={() => sendTopicDirect(topic)}>
                                                        {topic.title}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {relatedTopics.length > 0 && (
                                            <div className="help-related">
                                                <span>Relacionado:</span>
                                                {relatedTopics.map((topic) => (
                                                    <button type="button" key={topic.id} onClick={() => sendTopicDirect(topic)}>
                                                        {topic.title}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {messageTopicAllowed && (
                                            <button type="button" className="help-go-button" onClick={() => goToPage(message.topic)}>
                                                Ir a {message.topic.label}
                                                <ArrowRight size={15} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <form className="help-assistant-input" onSubmit={(event) => {
                        event.preventDefault();
                        sendQuestion();
                    }}>
                        <Search size={15} />
                        <input
                            ref={inputRef}
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            placeholder="Ej: /comandos, importar extracto, conciliar bancos..."
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
