export const sedesResultado = [
  { sede: "Sede Centro", ingresos: 18450000, egresos: 11230000, resultado: 7220000 },
  { sede: "Sede Norte", ingresos: 9850000, egresos: 6050000, resultado: 3800000 },
  { sede: "Sede Sur", ingresos: 7320000, egresos: 4850000, resultado: 2470000 },
  { sede: "Sede Oeste", ingresos: 5610000, egresos: 3950000, resultado: 1660000 },
  { sede: "Sede Pilar", ingresos: 3120000, egresos: 2150000, resultado: 970000 },
  { sede: "Sede Nueva 1", ingresos: 1400000, egresos: 980000, resultado: 420000 },
  { sede: "Sede Nueva 2", ingresos: 820000, egresos: 160000, resultado: 660000 },
];

export const ingresos = [
  {
    fecha: "31/05/2025",
    concepto: "Pago OSDE",
    sociedad: "Central Salud S.A.",
    origen: "Obra Social",
    importe: "$ 1.250.000",
    cobro: "Transferencia",
  },
  {
    fecha: "30/05/2025",
    concepto: "Pago Swiss Medical",
    sociedad: "Centro Médico S.A.",
    origen: "Obra Social",
    importe: "$ 960.000",
    cobro: "Transferencia",
  },
  {
    fecha: "30/05/2025",
    concepto: "Pago particular",
    sociedad: "Central Salud S.A.",
    origen: "Particular",
    importe: "$ 220.000",
    cobro: "Efectivo",
  },
];

export const egresos = [
  {
    fecha: "31/05/2025",
    proveedor: "Droguería del Sur",
    sociedad: "Central Salud S.A.",
    concepto: "Insumos médicos",
    importe: "$ 320.000",
    estado: "Pagado",
  },
  {
    fecha: "30/05/2025",
    proveedor: "Edenor",
    sociedad: "Centro Médico S.A.",
    concepto: "Servicios",
    importe: "$ 160.000",
    estado: "Pendiente",
  },
  {
    fecha: "29/05/2025",
    proveedor: "Laboratorios BACON",
    sociedad: "Sede Norte",
    concepto: "Reactivos",
    importe: "$ 250.000",
    estado: "Pendiente",
  },
];

export const usuarios = [
  {
    nombre: "Juan Pérez",
    email: "juan@CEDIM.com",
    rol: "Administrador",
    sede: "Todas",
    estado: "Activo",
  },
  {
    nombre: "María Gómez",
    email: "maria@CEDIM.com",
    rol: "Contador",
    sede: "Todas",
    estado: "Activo",
  },
  {
    nombre: "Ana López",
    email: "ana@CEDIM.com",
    rol: "Operador",
    sede: "Sede Norte",
    estado: "Activo",
  },
];


export const cuentasCorrientes = [
  {
    entidad: "OSDE",
    tipo: "Obra social",
    sede: "Sede Centro",
    saldo: "$ 4.850.000",
    vencido: "$ 1.250.000",
    estado: "Con deuda vencida",
  },
  {
    entidad: "Swiss Medical",
    tipo: "Prepaga",
    sede: "Sede Norte",
    saldo: "$ 3.120.000",
    vencido: "$ 0",
    estado: "Al día",
  },
  {
    entidad: "Droguería del Sur",
    tipo: "Proveedor",
    sede: "Todas",
    saldo: "$ -980.000",
    vencido: "$ -320.000",
    estado: "Pago pendiente",
  },
];

export const bancos = [
  {
    fecha: "31/05/2025",
    cuenta: "Banco Galicia - CC $",
    tipo: "Ingreso",
    descripcion: "Transferencia OSDE",
    importe: "$ 1.250.000",
    origen: "Extracto importado",
    estado: "Conciliado",
  },
  {
    fecha: "30/05/2025",
    cuenta: "Banco Nación - CA $",
    tipo: "Egreso",
    descripcion: "Pago Droguería del Sur",
    importe: "$ 320.000",
    origen: "Carga manual",
    estado: "Pendiente",
  },
  {
    fecha: "30/05/2025",
    cuenta: "Mercado Pago",
    tipo: "Ingreso",
    descripcion: "Pagos particulares",
    importe: "$ 220.000",
    origen: "Importación CSV",
    estado: "Movimiento sin identificar",
  },
];

export const reportes = [
  {
    reporte: "Resultado mensual por sede",
    modulo: "Finanzas",
    periodo: "Mayo 2025",
    generadoPor: "Juan Pérez",
    estado: "Disponible",
  },
  {
    reporte: "Estudios realizados por obra social",
    modulo: "Pacientes y estudios",
    periodo: "Mayo 2025",
    generadoPor: "María Gómez",
    estado: "Disponible",
  },
  {
    reporte: "Deuda vencida por entidad",
    modulo: "Cuentas corrientes",
    periodo: "Mayo 2025",
    generadoPor: "Sistema",
    estado: "Pendiente",
  },
];

export const documentos = [
  {
    fecha: "31/05/2025",
    tipo: "Factura",
    descripcion: "Factura OSDE mayo 2025",
    asociadoA: "OSDE",
    sede: "Sede Centro",
    estado: "Cargado",
  },
  {
    fecha: "30/05/2025",
    tipo: "Comprobante",
    descripcion: "Pago proveedor reactivos",
    asociadoA: "Laboratorios BACON",
    sede: "Sede Norte",
    estado: "Pendiente revisión",
  },
  {
    fecha: "29/05/2025",
    tipo: "Extracto bancario",
    descripcion: "Extracto Banco Galicia",
    asociadoA: "Banco Galicia",
    sede: "Todas",
    estado: "Conciliado",
  },
];

export const pacientes = [
  {
    paciente: "Laura Fernández",
    dni: "32.456.789",
    estudio: "Hemograma completo",
    sede: "Sede Centro",
    estado: "Resultado emitido",
    fecha: "31/05/2025",
  },
  {
    paciente: "Carlos Medina",
    dni: "28.951.224",
    estudio: "Perfil tiroideo",
    sede: "Sede Norte",
    estado: "En proceso",
    fecha: "31/05/2025",
  },
  {
    paciente: "Sofía Rivas",
    dni: "39.842.117",
    estudio: "Glucemia / Insulinemia",
    sede: "Sede Sur",
    estado: "Muestra recibida",
    fecha: "30/05/2025",
  },
];

export const sedes = [
  {
    sede: "Sede Centro",
    sociedad: "Central Salud S.A.",
    responsable: "Dr. Martín López",
    usuarios: 12,
    estudiosMes: 1840,
    estado: "Activa",
  },
  {
    sede: "Sede Norte",
    sociedad: "Centro Médico S.A.",
    responsable: "Dra. Paula Ruiz",
    usuarios: 8,
    estudiosMes: 960,
    estado: "Activa",
  },
  {
    sede: "Sede Pilar",
    sociedad: "CEDIM Pilar S.R.L.",
    responsable: "Lic. Ana Torres",
    usuarios: 5,
    estudiosMes: 420,
    estado: "Activa",
  },
];

export const configuracion = [
  {
    parametro: "Acceso multisede",
    descripcion: "Permite usuarios con visibilidad sobre una o varias sedes.",
    valor: "Activo",
  },
  {
    parametro: "Numeración de documentos",
    descripcion: "Secuencia automática para facturas, recibos y comprobantes.",
    valor: "Automática",
  },
  {
    parametro: "Storage documental",
    descripcion: "Repositorio previsto para facturas, comprobantes y resultados.",
    valor: "Supabase Storage",
  },
  {
    parametro: "Autenticación",
    descripcion: "Login y roles previstos para Supabase Auth.",
    valor: "Pendiente integración",
  },
];