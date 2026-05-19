import { useMemo } from "react";
import { Joyride } from "react-joyride";

const DEMO_EMAIL = "user@mail.com";

const EXCLUDED_PAGES = ["configuracion", "usuarios"];

const pageIntro = {
  dashboard: {
    title: "Panel principal",
    content:
      "Este es el panel principal del sistema. Desde acá se obtiene una vista rápida del estado general: ingresos, egresos, cuentas, turnos, documentos y actividad reciente.",
  },
  ingresos: {
    title: "Módulo de Ingresos",
    content:
      "En esta pantalla se cargan, consultan y controlan todos los ingresos económicos del centro. Sirve para registrar cobros de obras sociales, prepagas, particulares, facturas fiscales y otros conceptos.",
  },
  egresos: {
    title: "Módulo de Egresos",
    content:
      "En esta pantalla se cargan y consultan los gastos o salidas de dinero. Sirve para registrar pagos a proveedores, servicios, compras, sueldos u otros egresos administrativos.",
  },
  cuentas: {
    title: "Cuentas corrientes",
    content:
      "Esta pantalla permite controlar deudas, saldos pendientes y movimientos vinculados a pacientes, entidades, proveedores o cuentas internas.",
  },
  bancos: {
    title: "Bancos",
    content:
      "Este módulo permite registrar y controlar movimientos bancarios, cuentas, transferencias, ingresos, egresos y conciliaciones.",
  },
  reportes: {
    title: "Reportes",
    content:
      "Desde esta pantalla se generan reportes administrativos y contables para analizar la información del sistema y exportarla cuando sea necesario.",
  },
  documentos: {
    title: "Documentos",
    content:
      "Este módulo permite guardar, consultar y organizar documentación importante, como facturas, comprobantes, archivos administrativos o respaldos.",
  },
  pacientes: {
    title: "Pacientes y estudios",
    content:
      "Esta pantalla permite administrar pacientes y estudios médicos asociados. Sirve para consultar datos, registrar información y mantener ordenada la trazabilidad administrativa.",
  },
  turnos: {
    title: "Turnos",
    content:
      "Desde esta pantalla se organiza la agenda de atención. Permite visualizar, crear y controlar turnos, horarios, pacientes y estados.",
  },
  sedes: {
    title: "Sociedades / Sedes",
    content:
      "Esta pantalla permite administrar las sedes, sociedades o unidades operativas del sistema. Sirve para separar y organizar la información por ubicación o razón social.",
  },
};

const tourStepsByPage = {
  dashboard: [
    {
      target: '[data-tour="dashboard-header"]',
      title: "Bienvenido al Dashboard",
      content:
        "Esta es la pantalla inicial. Resume la información más importante para que puedas entender rápidamente el estado general del centro.",
      placement: "bottom",
    },
    {
      target: '[data-tour="dashboard-sede-selector"]',
      title: "Selector de sede",
      content:
        "Si el usuario tiene permiso para ver varias sedes, desde acá puede elegir si quiere ver la información de todas las sedes o solo una en particular.",
      placement: "bottom",
    },
    {
      target: '[data-tour="dashboard-kpis"]',
      title: "Indicadores principales",
      content:
        "Estos cuadros muestran los valores más importantes del sistema. Sirven para ver rápidamente totales, movimientos, pendientes o estados relevantes.",
      placement: "bottom",
    },
    {
      target: '[data-tour="dashboard-graficos"]',
      title: "Gráficos",
      content:
        "Los gráficos ayudan a interpretar la información de manera visual. Son útiles para detectar tendencias, comparar períodos o entender mejor la evolución del centro.",
      placement: "top",
    },
    {
      target: '[data-tour="dashboard-actividad"]',
      title: "Actividad reciente",
      content:
        "Esta sección muestra los últimos movimientos registrados. Sirve para revisar rápidamente qué se cargó o modificó recientemente.",
      placement: "top",
    },
  ],

  ingresos: [
    {
      target: '[data-tour="ingresos-header"]',
      title: "Pantalla de ingresos",
      content:
        "Acá se administran todos los ingresos económicos. Un ingreso puede ser un cobro de obra social, prepaga, particular, transferencia, efectivo u otra entrada de dinero.",
    },
    {
      target: '[data-tour="ingresos-actualizar"]',
      title: "Actualizar información",
      content:
        "Este botón vuelve a cargar los datos desde la base. Se usa cuando querés asegurarte de estar viendo la información más reciente.",
    },
    {
      target: '[data-tour="ingresos-importar-factura"]',
      title: "Importar factura PDF",
      content:
        "Permite subir una factura en PDF. El sistema intenta leer el QR fiscal y precargar datos como fecha, comprobante, CUIT e importe. Luego el usuario revisa y confirma antes de guardar.",
    },
    {
      target: '[data-tour="ingresos-nuevo"]',
      title: "Nuevo ingreso",
      content:
        "Abre el formulario para cargar un ingreso manualmente. Se usa cuando querés registrar un cobro o entrada de dinero desde cero.",
    },
    {
      target: '[data-tour="ingresos-resumen-total"]',
      title: "Total de ingresos",
      content:
        "Muestra la suma total de los ingresos que coinciden con los filtros aplicados.",
    },
    {
      target: '[data-tour="ingresos-resumen-cobrado"]',
      title: "Total cobrado",
      content:
        "Indica cuánto dinero ya fue confirmado como cobrado dentro del período o filtro seleccionado.",
    },
    {
      target: '[data-tour="ingresos-resumen-pendiente"]',
      title: "Pendiente de cobro",
      content:
        "Muestra el total de ingresos que todavía figuran como pendientes. Es útil para seguimiento administrativo.",
    },
    {
      target: '[data-tour="ingresos-resumen-facturas"]',
      title: "Facturas fiscales",
      content:
        "Indica cuántos ingresos tienen datos fiscales asociados, por ejemplo facturas importadas con QR.",
    },
    {
      target: '[data-tour="ingresos-busqueda"]',
      title: "Búsqueda",
      content:
        "Permite buscar ingresos por concepto, sociedad, sede, origen o comprobante. Es útil cuando hay muchos registros cargados.",
    },
    {
      target: '[data-tour="ingresos-filtro-estado"]',
      title: "Filtro por estado",
      content:
        "Permite ver todos los ingresos, solo los cobrados o solo los pendientes.",
    },
    {
      target: '[data-tour="ingresos-filtro-origen"]',
      title: "Filtro por origen",
      content:
        "Permite separar los ingresos según su origen, por ejemplo Obra Social, Prepaga, Particular o Factura fiscal.",
    },
    {
      target: '[data-tour="ingresos-filtro-cobro"]',
      title: "Filtro por forma de cobro",
      content:
        "Permite filtrar ingresos según cómo fueron cobrados: transferencia, efectivo, tarjeta, cheque u otra modalidad.",
    },
    {
      target: '[data-tour="ingresos-filtro-desde"]',
      title: "Fecha desde",
      content:
        "Define la fecha inicial del período que querés consultar.",
    },
    {
      target: '[data-tour="ingresos-filtro-hasta"]',
      title: "Fecha hasta",
      content:
        "Define la fecha final del período que querés consultar.",
    },
    {
      target: '[data-tour="ingresos-filtro-hoy"]',
      title: "Filtro rápido: Hoy",
      content:
        "Aplica automáticamente el filtro para ver solo los ingresos del día actual.",
    },
    {
      target: '[data-tour="ingresos-filtro-mes"]',
      title: "Filtro rápido: Este mes",
      content:
        "Aplica automáticamente el filtro para ver los ingresos cargados durante el mes actual.",
    },
    {
      target: '[data-tour="ingresos-filtro-pendientes"]',
      title: "Filtro rápido: Pendientes",
      content:
        "Muestra directamente los ingresos que todavía no fueron marcados como cobrados.",
    },
    {
      target: '[data-tour="ingresos-filtro-limpiar"]',
      title: "Limpiar filtros",
      content:
        "Borra todos los filtros aplicados y vuelve a mostrar la información general.",
    },
    {
      target: '[data-tour="ingresos-exportar-excel"]',
      title: "Exportar a Excel",
      content:
        "Genera un archivo Excel con la información filtrada. Es útil para análisis contable o administrativo.",
    },
    {
      target: '[data-tour="ingresos-exportar-pdf"]',
      title: "Exportar a PDF",
      content:
        "Genera un reporte PDF listo para guardar, imprimir o compartir.",
    },
    {
      target: '[data-tour="ingresos-resumen-origen"]',
      title: "Resumen por origen",
      content:
        "Agrupa los ingresos según su origen. Permite entender de dónde proviene el dinero y cuánto representa cada categoría.",
    },
    {
      target: '[data-tour="ingresos-tabla"]',
      title: "Detalle de ingresos",
      content:
        "Esta tabla muestra cada ingreso registrado con su fecha, concepto, sociedad, sede, origen, importe, forma de cobro, estado y acciones disponibles.",
    },
    {
      target: '[data-tour="ingresos-acciones"]',
      title: "Acciones de cada ingreso",
      content:
        "En esta columna se pueden ejecutar acciones sobre cada registro, como ver comprobante fiscal, marcar como cobrado o eliminar el ingreso.",
    },
  ],

  egresos: [
    {
      target: '[data-tour="egresos-header"]',
      title: "Pantalla de egresos",
      content:
        "Acá se administran los gastos y salidas de dinero. Cada egreso representa un pago, compra, servicio o movimiento económico negativo.",
    },
    {
      target: '[data-tour="egresos-actualizar"]',
      title: "Actualizar informaciÃ³n",
      content:
        "Este botÃ³n vuelve a consultar los egresos guardados y refresca los datos que ves en pantalla.",
    },
    {
      target: '[data-tour="egresos-importar-factura"]',
      title: "Importar factura PDF",
      content:
        "Permite subir una factura en PDF para que el sistema intente leer sus datos y ayude a cargar el egreso mÃ¡s rÃ¡pido.",
    },
    {
      target: '[data-tour="egresos-nuevo"]',
      title: "Nuevo egreso",
      content:
        "Abre el formulario para registrar un nuevo gasto o salida de dinero.",
    },
    {
      target: '[data-tour="egresos-resumen-total"]',
      title: "Total de egresos",
      content:
        "Muestra la suma total de egresos según los filtros aplicados.",
    },
    {
      target: '[data-tour="egresos-resumen-pagado"]',
      title: "Total pagado",
      content:
        "Indica cuánto dinero ya fue marcado como pagado.",
    },
    {
      target: '[data-tour="egresos-resumen-pendiente"]',
      title: "Pendiente de pago",
      content:
        "Muestra el importe de egresos que todavía no fueron abonados.",
    },
    {
      target: '[data-tour="egresos-busqueda"]',
      title: "Búsqueda de egresos",
      content:
        "Permite buscar gastos por concepto, proveedor, sede, categoría o comprobante.",
    },
    {
      target: '[data-tour="egresos-filtros"]',
      title: "Filtros de egresos",
      content:
        "Los filtros permiten reducir la información visible por fecha, estado, categoría, proveedor u otros criterios.",
    },
    {
      target: '[data-tour="egresos-filtro-estado"]',
      title: "Filtro por estado",
      content:
        "Permite ver todos los egresos o solo los que están pagados o pendientes.",
    },
    {
      target: '[data-tour="egresos-filtro-categoria"]',
      title: "Filtro por categoría",
      content:
        "Sirve para revisar gastos de una categoría específica, como insumos, servicios o proveedores.",
    },
    {
      target: '[data-tour="egresos-filtro-sociedad"]',
      title: "Filtro por sociedad",
      content:
        "Permite limitar el listado a los egresos asociados a una sociedad determinada.",
    },
    {
      target: '[data-tour="egresos-filtro-desde"]',
      title: "Fecha desde",
      content:
        "Define el inicio del período que querés consultar.",
    },
    {
      target: '[data-tour="egresos-filtro-hasta"]',
      title: "Fecha hasta",
      content:
        "Define el final del período que querés consultar.",
    },
    {
      target: '[data-tour="egresos-filtro-hoy"]',
      title: "Ver egresos de hoy",
      content:
        "Aplica rápidamente el filtro para ver solo los egresos del día actual.",
    },
    {
      target: '[data-tour="egresos-filtro-mes"]',
      title: "Ver egresos del mes",
      content:
        "Aplica rápidamente el período del mes actual.",
    },
    {
      target: '[data-tour="egresos-filtro-pendientes"]',
      title: "Ver pendientes",
      content:
        "Muestra los egresos que todavía no fueron marcados como pagados.",
    },
    {
      target: '[data-tour="egresos-filtro-limpiar"]',
      title: "Limpiar filtros",
      content:
        "Quita los filtros rápidos para volver a una vista más general.",
    },
    {
      target: '[data-tour="egresos-exportar-excel"]',
      title: "Exportar a Excel",
      content:
        "Genera un archivo Excel con los egresos filtrados para revisar o trabajar la información fuera del sistema.",
    },
    {
      target: '[data-tour="egresos-exportar-pdf"]',
      title: "Exportar a PDF",
      content:
        "Genera un reporte PDF con los egresos filtrados, listo para guardar, imprimir o compartir.",
    },
    {
      target: '[data-tour="egresos-tabla"]',
      title: "Detalle de egresos",
      content:
        "Esta tabla muestra cada egreso cargado, con su información administrativa y las acciones disponibles.",
    },
    {
      target: '[data-tour="egresos-acciones"]',
      title: "Acciones de egresos",
      content:
        "Desde esta columna se pueden realizar operaciones sobre cada egreso, como editar, marcar como pagado o eliminar.",
    },
  ],

  cuentas: [
    {
      target: '[data-tour="cuentas-header"]',
      title: "Pantalla de cuentas corrientes",
      content:
        "Esta pantalla sirve para controlar saldos, deudas, pagos pendientes y movimientos asociados a cuentas corrientes.",
    },
    {
      target: '[data-tour="cuentas-nueva"]',
      title: "Nueva cuenta o movimiento",
      content:
        "Permite crear una nueva cuenta corriente o cargar un nuevo movimiento, según la configuración del módulo.",
    },
    {
      target: '[data-tour="cuentas-resumen-total"]',
      title: "Saldo total",
      content:
        "Muestra el saldo general calculado según los registros visibles.",
    },
    {
      target: '[data-tour="cuentas-resumen-pendiente"]',
      title: "Saldo pendiente",
      content:
        "Indica cuánto queda pendiente de cobrar o pagar.",
    },
    {
      target: '[data-tour="cuentas-busqueda"]',
      title: "Búsqueda",
      content:
        "Permite buscar cuentas o movimientos por nombre, concepto, entidad o descripción.",
    },
    {
      target: '[data-tour="cuentas-filtros"]',
      title: "Filtros",
      content:
        "Los filtros ayudan a consultar solo los registros necesarios.",
    },
    {
      target: '[data-tour="cuentas-tabla"]',
      title: "Listado de cuentas corrientes",
      content:
        "Esta tabla muestra los registros de cuenta corriente y su estado administrativo.",
    },
    {
      target: '[data-tour="cuentas-acciones"]',
      title: "Acciones",
      content:
        "Desde acá se pueden realizar acciones sobre cada registro, como editar, revisar o eliminar.",
    },
  ],

  bancos: [
    {
      target: '[data-tour="bancos-header"]',
      title: "Pantalla de bancos",
      content:
        "Este módulo permite controlar movimientos bancarios y registrar operaciones relacionadas con cuentas del centro.",
    },
    {
      target: '[data-tour="bancos-nuevo"]',
      title: "Nuevo movimiento bancario",
      content:
        "Permite cargar una nueva operación bancaria, como ingreso, egreso, transferencia o ajuste.",
    },
    {
      target: '[data-tour="bancos-resumen-saldo"]',
      title: "Saldo bancario",
      content:
        "Muestra el saldo o resultado bancario calculado con los movimientos registrados.",
    },
    {
      target: '[data-tour="bancos-resumen-ingresos"]',
      title: "Ingresos bancarios",
      content:
        "Indica el total de movimientos positivos registrados.",
    },
    {
      target: '[data-tour="bancos-resumen-egresos"]',
      title: "Egresos bancarios",
      content:
        "Indica el total de movimientos negativos registrados.",
    },
    {
      target: '[data-tour="bancos-busqueda"]',
      title: "Búsqueda bancaria",
      content:
        "Permite buscar movimientos por concepto, cuenta, comprobante, fecha o descripción.",
    },
    {
      target: '[data-tour="bancos-filtros"]',
      title: "Filtros bancarios",
      content:
        "Sirven para consultar movimientos específicos por fecha, cuenta o tipo de operación.",
    },
    {
      target: '[data-tour="bancos-tabla"]',
      title: "Detalle de movimientos",
      content:
        "Esta tabla muestra los movimientos bancarios registrados y sus datos principales.",
    },
    {
      target: '[data-tour="bancos-acciones"]',
      title: "Acciones",
      content:
        "Desde esta columna se pueden modificar, revisar o eliminar movimientos bancarios.",
    },
  ],

  reportes: [
    {
      target: '[data-tour="reportes-header"]',
      title: "Pantalla de reportes",
      content:
        "Desde esta pantalla se generan reportes para revisar la información del sistema de manera ordenada.",
    },
    {
      target: '[data-tour="reportes-periodo"]',
      title: "Período del reporte",
      content:
        "Permite seleccionar desde qué fecha y hasta qué fecha se quiere analizar la información.",
    },
    {
      target: '[data-tour="dashboard-sede-selector"]',
      title: "Filtro por sede",
      content:
        "El selector global de sede permite analizar reportes de todas las sedes disponibles o enfocarse en una sede específica.",
    },
    {
      target: '[data-tour="reportes-tipo"]',
      title: "Tipo de reporte",
      content:
        "Permite elegir qué clase de información se quiere analizar, por ejemplo ingresos, egresos, bancos o resumen general.",
    },
    {
      target: '[data-tour="reportes-generar"]',
      title: "Generar reporte",
      content:
        "Procesa los filtros seleccionados y muestra el resultado del reporte.",
    },
    {
      target: '[data-tour="reportes-exportar-excel"]',
      title: "Exportar Excel",
      content:
        "Genera un archivo Excel para análisis administrativo o contable.",
    },
    {
      target: '[data-tour="reportes-exportar-pdf"]',
      title: "Exportar PDF",
      content:
        "Genera un PDF para guardar, imprimir o enviar.",
    },
    {
      target: '[data-tour="reportes-resultados"]',
      title: "Resultados del reporte",
      content:
        "En esta zona se visualiza la información calculada según los filtros aplicados.",
    },
  ],

  documentos: [
    {
      target: '[data-tour="documentos-header"]',
      title: "Pantalla de documentos",
      content:
        "Este módulo permite almacenar y consultar archivos importantes relacionados con la operación del centro.",
    },
    {
      target: '[data-tour="documentos-subir"]',
      title: "Subir documento",
      content:
        "Permite cargar un archivo nuevo al sistema, por ejemplo una factura, comprobante, recibo o documento administrativo.",
    },
    {
      target: '[data-tour="documentos-tipo"]',
      title: "Tipo de documento",
      content:
        "Permite clasificar el archivo para encontrarlo más fácilmente después.",
    },
    {
      target: '[data-tour="documentos-busqueda"]',
      title: "Búsqueda de documentos",
      content:
        "Permite buscar archivos por nombre, descripción, tipo, sede o información relacionada.",
    },
    {
      target: '[data-tour="documentos-filtros"]',
      title: "Filtros de documentos",
      content:
        "Ayudan a mostrar únicamente los documentos que cumplen con ciertos criterios.",
    },
    {
      target: '[data-tour="documentos-tabla"]',
      title: "Listado de documentos",
      content:
        "Esta tabla muestra los documentos cargados y sus datos principales.",
    },
    {
      target: '[data-tour="documentos-acciones"]',
      title: "Acciones sobre documentos",
      content:
        "Desde esta zona se puede abrir, descargar, revisar o eliminar un documento, según los permisos disponibles.",
    },
  ],

  pacientes: [
    {
      target: '[data-tour="pacientes-header"]',
      title: "Pantalla de pacientes y estudios",
      content:
        "Este módulo permite consultar y administrar información relacionada con pacientes y estudios médicos.",
    },
    {
      target: '[data-tour="pacientes-nuevo"]',
      title: "Nuevo paciente o estudio",
      content:
        "Permite cargar un nuevo paciente, estudio o registro relacionado, según la configuración de la pantalla.",
    },
    {
      target: '[data-tour="pacientes-busqueda"]',
      title: "Búsqueda",
      content:
        "Permite encontrar pacientes o estudios rápidamente usando datos como nombre, documento, obra social o descripción.",
    },
    {
      target: '[data-tour="pacientes-filtros"]',
      title: "Filtros",
      content:
        "Los filtros permiten reducir el listado para ver solo los registros necesarios.",
    },
    {
      target: '[data-tour="pacientes-tabla"]',
      title: "Listado de pacientes y estudios",
      content:
        "Esta tabla muestra la información cargada y permite revisar los datos principales de cada registro.",
    },
    {
      target: '[data-tour="pacientes-acciones"]',
      title: "Acciones",
      content:
        "Desde esta columna se pueden consultar, editar o eliminar registros, según corresponda.",
    },
  ],

  turnos: [
    {
      target: '[data-tour="turnos-header"]',
      title: "Pantalla de turnos",
      content:
        "Esta pantalla permite organizar la agenda de atención del centro.",
    },
    {
      target: '[data-tour="turnos-nuevo"]',
      title: "Nuevo turno",
      content:
        "Permite cargar un nuevo turno con fecha, horario, paciente y datos asociados.",
    },
    {
      target: '[data-tour="turnos-fecha"]',
      title: "Selector de fecha",
      content:
        "Permite elegir qué día o período de turnos se quiere consultar.",
    },
    {
      target: '[data-tour="turnos-estado"]',
      title: "Estado del turno",
      content:
        "Permite diferenciar turnos pendientes, confirmados, atendidos o cancelados.",
    },
    {
      target: '[data-tour="turnos-calendario"]',
      title: "Agenda de turnos",
      content:
        "En esta zona se visualizan los turnos cargados. Sirve para organizar la atención y revisar disponibilidad.",
    },
    {
      target: '[data-tour="turnos-acciones"]',
      title: "Acciones",
      content:
        "Desde las acciones se puede modificar, confirmar, cancelar o revisar un turno.",
    },
  ],

  sedes: [
    {
      target: '[data-tour="sedes-header"]',
      title: "Pantalla de sociedades y sedes",
      content:
        "Esta pantalla permite administrar las sedes, sociedades o unidades de trabajo del sistema.",
    },
    {
      target: '[data-tour="sedes-nueva"]',
      title: "Nueva sede",
      content:
        "Permite crear una nueva sede o sociedad para organizar la información del sistema.",
    },
    {
      target: '[data-tour="sedes-busqueda"]',
      title: "Búsqueda",
      content:
        "Permite encontrar rápidamente una sede o sociedad dentro del listado.",
    },
    {
      target: '[data-tour="sedes-tabla"]',
      title: "Listado de sedes",
      content:
        "Esta tabla muestra las sedes configuradas, su información principal y estado.",
    },
    {
      target: '[data-tour="sedes-acciones"]',
      title: "Acciones",
      content:
        "Desde esta columna se pueden editar, revisar o modificar datos de una sede.",
    },
  ],
};

function getSteps(activePage) {
  const intro = pageIntro[activePage];

  const introStep = intro
    ? {
        target: "body",
        title: intro.title,
        content: intro.content,
        placement: "center",
        disableBeacon: true,
      }
    : null;

  const pageSteps = tourStepsByPage[activePage] || [];

  const preparedSteps = pageSteps.map((step, index) => ({
    ...step,
    disableBeacon: index === 0 ? true : step.disableBeacon,
  }));

  return introStep ? [introStep, ...preparedSteps] : preparedSteps;
}

export default function DemoTour({ activePage, currentUser }) {
  const isDemoUser = currentUser?.email?.toLowerCase() === DEMO_EMAIL;
  const isExcludedPage = EXCLUDED_PAGES.includes(activePage);

  const steps = useMemo(() => getSteps(activePage), [activePage]);

  if (!isDemoUser || isExcludedPage || !steps.length) {
    return null;
  }

  return (
    <Joyride
      key={`demo-tour-${activePage}`}
      steps={steps}
      run={true}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      disableOverlayClose={true}
      disableScrolling={false}
      scrollToFirstStep={true}
      spotlightClicks={false}
      hideCloseButton={false}
      locale={{
        back: "Atrás",
        close: "Cerrar",
        last: "Finalizar",
        next: "Siguiente",
        skip: "Saltar tutorial",
      }}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: "#2563eb",
          textColor: "#111827",
          backgroundColor: "#ffffff",
          overlayColor: "rgba(15, 23, 42, 0.58)",
          arrowColor: "#ffffff",
        },
        tooltip: {
          borderRadius: 16,
          padding: 18,
          maxWidth: 430,
        },
        tooltipTitle: {
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 8,
        },
        tooltipContent: {
          fontSize: 14,
          lineHeight: 1.55,
          textAlign: "left",
        },
        buttonNext: {
          borderRadius: 10,
        },
        buttonBack: {
          color: "#475569",
          marginRight: 8,
        },
        buttonSkip: {
          color: "#64748b",
        },
      }}
    />
  );
}
