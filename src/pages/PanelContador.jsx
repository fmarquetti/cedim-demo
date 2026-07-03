import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Gauge,
  Landmark,
  Percent,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";

import { getPanelContador } from "../services/panelContadorService";
import {
  addPdfFooter,
  addPdfHeader,
  autoTable,
  ExcelJS,
  exportWorkbook,
  formatDate,
  formatMoney,
  jsPDF,
  safeFileName,
  styleWorkbook,
} from "../utils/reportUtils";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const severityIcon = {
  OK: CheckCircle2,
  WARNING: AlertTriangle,
  ERROR: XCircle,
  INFO: AlertTriangle,
};

const severityClass = (value) => String(value || "").toLowerCase();

function KpiCard({ label, value, detail, icon: Icon = Gauge }) {
  return (
    <div className="stat-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <Icon size={22} />
    </div>
  );
}

export default function PanelContador({ selectedSede, sedeId, setActivePage }) {
  const now = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedSedeName =
    typeof selectedSede === "object" && selectedSede !== null
      ? selectedSede.nombre
      : selectedSede || "Todas las sedes";

  const anios = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 7 }, (_, index) => current - 3 + index);
  }, [now]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getPanelContador({ anio, mes, sedeId });
      setData(result);
    } catch (err) {
      console.error("Error cargando panel del contador:", err);
      setError(err.message || "No se pudo cargar el panel del contador.");
    } finally {
      setLoading(false);
    }
  }, [anio, mes, sedeId]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const fileBaseName = useMemo(
    () => safeFileName(`Panel_Contador_${anio}_${String(mes).padStart(2, "0")}_${selectedSedeName}`),
    [anio, mes, selectedSedeName]
  );

  const exportarPDF = () => {
    if (!data) return;

    const doc = new jsPDF("landscape", "mm", "a4");
    const periodo = `${MESES[data.periodo.mes - 1]} ${data.periodo.anio} | ${formatDate(data.periodo.desde)} al ${formatDate(data.periodo.hasta)} | Sede: ${selectedSedeName}`;
    addPdfHeader(doc, { title: "Panel del Contador", subtitle: periodo });

    autoTable(doc, {
      startY: 42,
      head: [["Indicador", "Valor"]],
      body: [
        ["Estado periodo", data.periodo.estado],
        ["Listo para cerrar", data.listoParaCerrar ? "Si" : "No"],
        ["IVA debito fiscal", formatMoney(data.iva.ivaDebito)],
        ["IVA credito fiscal", formatMoney(data.iva.ivaCredito)],
        ["Saldo IVA", formatMoney(data.iva.saldoIva)],
        ["Cantidad de asientos", data.contabilidad.cantidadAsientos],
        ["Operaciones sin asiento", data.contabilidad.operacionesSinAsiento],
        ["Asientos desbalanceados", data.contabilidad.asientosDesbalanceados],
        ["Diferencia debe/haber", formatMoney(data.contabilidad.diferencia)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 58, 138] },
      columnStyles: { 1: { halign: "right" } },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Checklist", "Estado", "Detalle"]],
      body: data.checklist.map((item) => [item.label, item.severity, item.detail]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Operacion", "Valor"]],
      body: [
        ["Ingresos total", formatMoney(data.operaciones.ingresosTotal)],
        ["Ingresos pendientes", formatMoney(data.operaciones.ingresosPendientes)],
        ["Egresos total", formatMoney(data.operaciones.egresosTotal)],
        ["Egresos pendientes", formatMoney(data.operaciones.egresosPendientes)],
        ["Facturas ARCA", data.operaciones.facturasArcaCantidad],
        ["Total ARCA", formatMoney(data.operaciones.facturasArcaTotal)],
        ["Movimientos bancarios pendientes", data.operaciones.movimientosBancariosPendientes],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] },
      columnStyles: { 1: { halign: "right" } },
    });

    addPdfFooter(doc);
    doc.save(`${fileBaseName}.pdf`);
  };

  const exportarExcel = async () => {
    if (!data) return;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CEDIM - TECNEW";
    workbook.created = new Date();

    const resumen = workbook.addWorksheet("Resumen");
    resumen.columns = [
      { header: "Indicador", key: "indicador", width: 34 },
      { header: "Valor", key: "valor", width: 24 },
    ];
    resumen.addRows([
      { indicador: "Sede", valor: selectedSedeName },
      { indicador: "Periodo", valor: `${MESES[data.periodo.mes - 1]} ${data.periodo.anio}` },
      { indicador: "Estado periodo", valor: data.periodo.estado },
      { indicador: "Listo para cerrar", valor: data.listoParaCerrar ? "Si" : "No" },
      { indicador: "IVA debito fiscal", valor: data.iva.ivaDebito },
      { indicador: "IVA credito fiscal", valor: data.iva.ivaCredito },
      { indicador: "Saldo IVA", valor: data.iva.saldoIva },
      { indicador: "Cantidad de asientos", valor: data.contabilidad.cantidadAsientos },
      { indicador: "Diferencia debe/haber", valor: data.contabilidad.diferencia },
    ]);

    const checklist = workbook.addWorksheet("Checklist");
    checklist.columns = [
      { header: "Clave", key: "key", width: 28 },
      { header: "Control", key: "label", width: 38 },
      { header: "Estado", key: "severity", width: 14 },
      { header: "Detalle", key: "detail", width: 60 },
    ];
    checklist.addRows(data.checklist);

    const operaciones = workbook.addWorksheet("Operaciones");
    operaciones.columns = [
      { header: "Indicador", key: "indicador", width: 36 },
      { header: "Valor", key: "valor", width: 20 },
    ];
    operaciones.addRows(Object.entries(data.operaciones).map(([indicador, valor]) => ({ indicador, valor })));

    const ordenes = workbook.addWorksheet("Ordenes de Pago");
    ordenes.columns = operaciones.columns;
    ordenes.addRows(Object.entries(data.ordenesPago).map(([indicador, valor]) => ({ indicador, valor })));

    const cuentas = workbook.addWorksheet("Cuentas Corrientes");
    cuentas.columns = operaciones.columns;
    cuentas.addRows(Object.entries(data.cuentasCorrientes).map(([indicador, valor]) => ({ indicador, valor })));

    styleWorkbook(workbook);
    await exportWorkbook(workbook, `${fileBaseName}.xlsx`);
  };

  const goTo = (page) => {
    if (typeof setActivePage === "function") setActivePage(page);
  };

  return (
    <section className="page">
      <div className="page-header" data-tour="panel-contador-header">
        <div>
          <h2>Panel del Contador</h2>
          <p>Resumen mensual para control contable, IVA, pendientes y cierre.</p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="secondary-button" onClick={exportarExcel} disabled={loading || !data}>
            <FileSpreadsheet size={16} /> Exportar resumen Excel
          </button>
          <button className="primary-button" onClick={exportarPDF} disabled={loading || !data}>
            <FileText size={16} /> Exportar resumen PDF
          </button>
        </div>
      </div>

      <div className="filters-bar" data-tour="panel-contador-filtros">
        <select value={anio} onChange={(event) => setAnio(Number(event.target.value))}>
          {anios.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select value={mes} onChange={(event) => setMes(Number(event.target.value))}>
          {MESES.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </select>
        <button className="secondary-button" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} /> Actualizar
        </button>
        <span className="muted">Sede: {selectedSedeName}</span>
      </div>

      {error && <div className="login-error">{error}</div>}
      {!error && loading && <p className="muted">Cargando panel del contador...</p>}

      {!error && !loading && data && (
        <>
          <div className="panel" data-tour="panel-contador-periodo">
            <div className="page-header">
              <div>
                <h3>
                  {MESES[data.periodo.mes - 1]} {data.periodo.anio}
                </h3>
                <p>
                  {formatDate(data.periodo.desde)} al {formatDate(data.periodo.hasta)}
                </p>
              </div>
              <div>
                <span className={`status-badge ${severityClass(data.periodo.estado)}`}>
                  {data.periodo.estado}
                </span>
                <p className="muted">
                  {data.listoParaCerrar
                    ? "El periodo esta listo para revision/cierre."
                    : "Existen alertas que deben revisarse antes del cierre."}
                </p>
              </div>
            </div>
          </div>

          <div className="stats-grid small" data-tour="panel-contador-kpis">
            <KpiCard label="IVA debito fiscal" value={formatMoney(data.iva.ivaDebito)} detail={`Ventas ${formatMoney(data.iva.totalVentas)}`} icon={Percent} />
            <KpiCard label="IVA credito fiscal" value={formatMoney(data.iva.ivaCredito)} detail={`Compras ${formatMoney(data.iva.totalCompras)}`} icon={Calculator} />
            <KpiCard label="Saldo IVA" value={formatMoney(data.iva.saldoIva)} detail="Debito menos credito" icon={Percent} />
            <KpiCard label="Cantidad de asientos" value={data.contabilidad.cantidadAsientos} detail={`${formatMoney(data.contabilidad.totalDebe)} / ${formatMoney(data.contabilidad.totalHaber)}`} icon={BookOpenCheck} />
            <KpiCard label="Operaciones sin asiento" value={data.contabilidad.operacionesSinAsiento} detail={`${data.contabilidad.alertas} alertas contables`} icon={AlertTriangle} />
            <KpiCard label="Asientos desbalanceados" value={data.contabilidad.asientosDesbalanceados} detail="Control de auditoria" icon={XCircle} />
            <KpiCard label="Diferencia debe/haber" value={formatMoney(data.contabilidad.diferencia)} detail="Tolerancia 0,01" icon={Gauge} />
          </div>

          <div className="stats-grid small" data-tour="panel-contador-operaciones">
            <KpiCard label="Ingresos total" value={formatMoney(data.operaciones.ingresosTotal)} detail={`Pendiente ${formatMoney(data.operaciones.ingresosPendientes)}`} icon={Banknote} />
            <KpiCard label="Egresos total" value={formatMoney(data.operaciones.egresosTotal)} detail={`Pendiente ${formatMoney(data.operaciones.egresosPendientes)}`} icon={Wallet} />
            <KpiCard label="Facturas ARCA" value={data.operaciones.facturasArcaCantidad} detail={formatMoney(data.operaciones.facturasArcaTotal)} icon={FileText} />
            <KpiCard label="Movimientos bancarios" value={data.operaciones.movimientosBancariosCantidad} detail={`${data.operaciones.movimientosBancariosPendientes} pendientes`} icon={Landmark} />
          </div>

          <div className="stats-grid small" data-tour="panel-contador-ordenes">
            <KpiCard label="Borrador" value={data.ordenesPago.borrador} icon={ClipboardCheck} />
            <KpiCard label="Aprobadas" value={data.ordenesPago.aprobada} icon={ClipboardCheck} />
            <KpiCard label="Pagadas" value={data.ordenesPago.pagada} icon={CheckCircle2} />
            <KpiCard label="Importe pendiente" value={formatMoney(data.ordenesPago.importePendiente)} icon={Wallet} />
            <KpiCard label="Importe pagado" value={formatMoney(data.ordenesPago.importePagado)} icon={Banknote} />
          </div>

          <div className="stats-grid small" data-tour="panel-contador-cc">
            <KpiCard label="Clientes con saldo" value={data.cuentasCorrientes.clientesConSaldo} icon={Wallet} />
            <KpiCard label="Saldo clientes" value={formatMoney(data.cuentasCorrientes.saldoClientes)} icon={Banknote} />
            <KpiCard label="Proveedores con saldo" value={data.cuentasCorrientes.proveedoresConSaldo} icon={Wallet} />
            <KpiCard label="Saldo proveedores" value={formatMoney(data.cuentasCorrientes.saldoProveedores)} icon={Banknote} />
          </div>

          <div className="panel" data-tour="panel-contador-checklist">
            <h3>Checklist de cierre</h3>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Control</th>
                    <th>Estado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {data.checklist.map((item) => {
                    const Icon = severityIcon[item.severity] || AlertTriangle;
                    return (
                      <tr key={item.key}>
                        <td>{item.label}</td>
                        <td>
                          <span className={`status-badge ${severityClass(item.severity)}`}>
                            <Icon size={14} /> {item.severity}
                          </span>
                        </td>
                        <td>{item.detail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" data-tour="panel-contador-accesos">
            <h3>Accesos rapidos</h3>
            <div className="header-actions">
              <button className="secondary-button" onClick={() => goTo("iva")}>Ir a IVA</button>
              <button className="secondary-button" onClick={() => goTo("contabilidad")}>Ir a Contabilidad</button>
              <button className="secondary-button" onClick={() => goTo("auditoriaContable")}>Ir a Auditoria Contable</button>
              <button className="secondary-button" onClick={() => goTo("periodosContables")}>Ir a Periodos Contables</button>
              <button className="secondary-button" onClick={() => goTo("ordenesPago")}>Ir a Ordenes de Pago</button>
              <button className="secondary-button" onClick={() => goTo("cuentasCorrientesEntidades")}>Ir a Cuentas Corrientes</button>
              <button className="secondary-button" onClick={() => goTo("reportes")}>Ir a Reportes</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
