import { useCallback, useEffect, useMemo, useState } from "react";
import { BookPlus, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";

import {
  generarBalanceSumasYSaldos,
  generarLibroDiario,
  generarLibroMayor,
  getCuentasContables,
} from "../services/contabilidadService";
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

const VISTAS = {
  plan: "Plan de cuentas",
  diario: "Libro diario",
  mayor: "Libro mayor",
  balance: "Balance de sumas y saldos",
};

function EmptyRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan}>No hay informacion para los filtros seleccionados.</td>
    </tr>
  );
}

export default function Contabilidad({ sedeId, setActivePage }) {
  const [cuentas, setCuentas] = useState([]);
  const [libroDiario, setLibroDiario] = useState([]);
  const [libroMayor, setLibroMayor] = useState([]);
  const [balance, setBalance] = useState([]);
  const [cuentaMayorId, setCuentaMayorId] = useState("");

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [vista, setVista] = useState("plan");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { desde, hasta, sedeId };

      const [cuentasData, diarioData, mayorData, balanceData] = await Promise.all([
        getCuentasContables(),
        generarLibroDiario(params),
        generarLibroMayor({ ...params, cuentaId: cuentaMayorId || undefined }),
        generarBalanceSumasYSaldos(params),
      ]);

      setCuentas(cuentasData || []);
      setLibroDiario(diarioData || []);
      setLibroMayor(mayorData || []);
      setBalance(balanceData || []);
    } catch (err) {
      console.error("Error cargando contabilidad:", err);
      setError(err.message || "No se pudo cargar la informacion contable.");
    } finally {
      setLoading(false);
    }
  }, [cuentaMayorId, desde, hasta, sedeId]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const cuentasImputables = useMemo(
    () => cuentas.filter((cuenta) => cuenta.imputable && cuenta.activa),
    [cuentas]
  );

  const periodoArchivo = `${desde || "inicio"}_${hasta || "actual"}`;
  const periodoPdf = `Periodo: ${desde ? formatDate(desde) : "Inicio"} al ${hasta ? formatDate(hasta) : "Actual"}`;
  const nombreArchivo = `Contabilidad_${safeFileName(VISTAS[vista])}_${safeFileName(periodoArchivo)}`;

  const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CEDIM - TECNEW";
    workbook.created = new Date();

    if (vista === "plan") {
      const sheet = workbook.addWorksheet("Plan de cuentas");
      sheet.columns = [
        { header: "Codigo", key: "codigo", width: 16 },
        { header: "Nombre", key: "nombre", width: 34 },
        { header: "Tipo", key: "tipo", width: 16 },
        { header: "Subtipo", key: "subtipo", width: 18 },
        { header: "Imputable", key: "imputable", width: 12 },
        { header: "Activa", key: "activa", width: 12 },
      ];
      sheet.addRows(cuentas.map((cuenta) => ({
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        tipo: cuenta.tipo,
        subtipo: cuenta.subtipo || "",
        imputable: cuenta.imputable ? "Si" : "No",
        activa: cuenta.activa ? "Si" : "No",
      })));
    }

    if (vista === "diario") {
      const sheet = workbook.addWorksheet("Libro diario");
      sheet.columns = [
        { header: "Fecha", key: "fecha", width: 14 },
        { header: "Numero", key: "numero", width: 16 },
        { header: "Concepto", key: "concepto", width: 34 },
        { header: "Codigo cuenta", key: "codigo", width: 16 },
        { header: "Cuenta", key: "cuenta", width: 34 },
        { header: "Descripcion", key: "descripcion", width: 34 },
        { header: "Debe", key: "debe", width: 16 },
        { header: "Haber", key: "haber", width: 16 },
        { header: "Origen", key: "origen", width: 18 },
      ];
      sheet.addRows(libroDiario.map((fila) => ({
        fecha: formatDate(fila.fecha),
        numero: fila.numero,
        concepto: fila.concepto,
        codigo: fila.cuentaCodigo,
        cuenta: fila.cuentaNombre,
          descripcion: fila.descripcion || "",
        debe: Number(fila.debe || 0),
        haber: Number(fila.haber || 0),
        origen: fila.origen,
      })));
      sheet.getColumn("debe").numFmt = '"$"#,##0.00';
      sheet.getColumn("haber").numFmt = '"$"#,##0.00';
    }

    if (vista === "mayor") {
      const sheet = workbook.addWorksheet("Libro mayor");
      sheet.columns = [
        { header: "Cuenta", key: "cuenta", width: 38 },
        { header: "Fecha", key: "fecha", width: 14 },
        { header: "Numero", key: "numero", width: 16 },
        { header: "Concepto", key: "concepto", width: 34 },
        { header: "Descripcion", key: "descripcion", width: 34 },
        { header: "Debe", key: "debe", width: 16 },
        { header: "Haber", key: "haber", width: 16 },
        { header: "Saldo", key: "saldo", width: 16 },
      ];
      sheet.addRows(libroMayor.flatMap((grupo) =>
        grupo.movimientos.map((mov) => ({
          cuenta: `${grupo.cuentaCodigo} - ${grupo.cuentaNombre}`,
          fecha: formatDate(mov.fecha),
          numero: mov.numero,
          concepto: mov.concepto,
          descripcion: mov.descripcion || "",
          debe: Number(mov.debe || 0),
          haber: Number(mov.haber || 0),
          saldo: Number(mov.saldo || 0),
        }))
      ));
      ["debe", "haber", "saldo"].forEach((key) => {
        sheet.getColumn(key).numFmt = '"$"#,##0.00';
      });
    }

    if (vista === "balance") {
      const sheet = workbook.addWorksheet("Balance");
      sheet.columns = [
        { header: "Codigo", key: "codigo", width: 16 },
        { header: "Cuenta", key: "cuenta", width: 34 },
        { header: "Tipo", key: "tipo", width: 16 },
        { header: "Suma Debe", key: "sumaDebe", width: 16 },
        { header: "Suma Haber", key: "sumaHaber", width: 16 },
        { header: "Saldo Deudor", key: "saldoDeudor", width: 16 },
        { header: "Saldo Acreedor", key: "saldoAcreedor", width: 16 },
      ];
      sheet.addRows(balance.map((fila) => ({
        codigo: fila.cuentaCodigo,
        cuenta: fila.cuentaNombre,
        tipo: fila.tipo,
        sumaDebe: Number(fila.sumaDebe || 0),
        sumaHaber: Number(fila.sumaHaber || 0),
        saldoDeudor: Number(fila.saldoDeudor || 0),
        saldoAcreedor: Number(fila.saldoAcreedor || 0),
      })));
      ["sumaDebe", "sumaHaber", "saldoDeudor", "saldoAcreedor"].forEach((key) => {
        sheet.getColumn(key).numFmt = '"$"#,##0.00';
      });
    }

    styleWorkbook(workbook);
    await exportWorkbook(workbook, `${nombreArchivo}.xlsx`);
  };

  const exportarPdf = () => {
    const doc = new jsPDF("landscape", "mm", "a4");
    addPdfHeader(doc, { title: VISTAS[vista], subtitle: periodoPdf });

    if (vista === "plan") {
      autoTable(doc, {
        startY: 42,
        head: [["Codigo", "Nombre", "Tipo", "Subtipo", "Imputable", "Activa"]],
        body: cuentas.map((cuenta) => [
          cuenta.codigo,
          cuenta.nombre,
          cuenta.tipo,
          cuenta.subtipo || "",
          cuenta.imputable ? "Si" : "No",
          cuenta.activa ? "Si" : "No",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 138] },
      });
    }

    if (vista === "diario") {
      autoTable(doc, {
        startY: 42,
        head: [["Fecha", "Nro", "Concepto", "Cuenta", "Debe", "Haber", "Origen"]],
        body: libroDiario.map((fila) => [
          formatDate(fila.fecha),
          fila.numero,
          fila.concepto,
          `${fila.cuentaCodigo} - ${fila.cuentaNombre}`,
          formatMoney(fila.debe),
          formatMoney(fila.haber),
          fila.origen,
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 138] },
        columnStyles: { 4: { halign: "right" }, 5: { halign: "right" } },
      });
    }

    if (vista === "mayor") {
      const body = cuentaMayorId
        ? libroMayor.flatMap((grupo) =>
            grupo.movimientos.map((mov) => [
              formatDate(mov.fecha),
              mov.numero,
              mov.concepto,
              mov.descripcion || "",
              formatMoney(mov.debe),
              formatMoney(mov.haber),
              formatMoney(mov.saldo),
            ])
          )
        : libroMayor.map((grupo) => [
            `${grupo.cuentaCodigo} - ${grupo.cuentaNombre}`,
            formatMoney(grupo.totalDebe),
            formatMoney(grupo.totalHaber),
            formatMoney(grupo.saldoFinal),
          ]);

      autoTable(doc, {
        startY: 42,
        head: cuentaMayorId
          ? [["Fecha", "Nro", "Concepto", "Descripcion", "Debe", "Haber", "Saldo"]]
          : [["Cuenta", "Total Debe", "Total Haber", "Saldo Final"]],
        body,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 138] },
        columnStyles: cuentaMayorId
          ? { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } }
          : { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
    }

    if (vista === "balance") {
      autoTable(doc, {
        startY: 42,
        head: [["Codigo", "Cuenta", "Tipo", "Suma Debe", "Suma Haber", "Saldo Deudor", "Saldo Acreedor"]],
        body: balance.map((fila) => [
          fila.cuentaCodigo,
          fila.cuentaNombre,
          fila.tipo,
          formatMoney(fila.sumaDebe),
          formatMoney(fila.sumaHaber),
          formatMoney(fila.saldoDeudor),
          formatMoney(fila.saldoAcreedor),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 138] },
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
      });
    }

    addPdfFooter(doc);
    doc.save(`${nombreArchivo}.pdf`);
  };

  const hasExportData =
    (vista === "plan" && cuentas.length > 0) ||
    (vista === "diario" && libroDiario.length > 0) ||
    (vista === "mayor" && libroMayor.length > 0) ||
    (vista === "balance" && balance.length > 0);

  return (
    <section className="page">
      <div className="page-header" data-tour="contabilidad-header">
        <div>
          <h2>Contabilidad</h2>
          <p>Plan de cuentas, libro diario, mayores y balance de sumas y saldos.</p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="secondary-button" onClick={exportarExcel} disabled={loading || !hasExportData}>
            <FileSpreadsheet size={16} /> Exportar Excel
          </button>
          <button className="primary-button" onClick={exportarPdf} disabled={loading || !hasExportData}>
            <FileText size={16} /> Exportar PDF
          </button>
        </div>
      </div>

      <div className="panel">
        <p className="muted no-margin">
          Los reportes contables dependen de los asientos generados y del estado de los períodos contables.
          Cerrá un período solo después de revisar pendientes. Los saldos iniciales generan un asiento de apertura
          y afectan el Libro Mayor y el Balance de Sumas y Saldos.
        </p>
        {setActivePage && (
          <button
            type="button"
            className="secondary-button button-spaced"
            onClick={() => setActivePage("saldosIniciales")}
          >
            <BookPlus size={16} /> Ir a Saldos Iniciales
          </button>
        )}
      </div>

      <div className="filters-bar" data-tour="contabilidad-filtros">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button className="secondary-button" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} /> Actualizar
        </button>

        <select value={vista} onChange={(e) => setVista(e.target.value)} data-tour="contabilidad-vista">
          {Object.entries(VISTAS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="panel" data-tour="contabilidad-contenido">
        {error && <div className="login-error">{error}</div>}

        {!error && loading && <p className="muted">Cargando informacion contable...</p>}

        {!error && !loading && vista === "plan" && (
          <>
            <h3>Plan de cuentas</h3>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Imputable</th>
                    <th>Activa</th>
                  </tr>
                </thead>
                <tbody>
                  {cuentas.map((cuenta) => (
                    <tr key={cuenta.id}>
                      <td>{cuenta.codigo}</td>
                      <td>{cuenta.nombre}</td>
                      <td>{cuenta.tipo}</td>
                      <td>{cuenta.imputable ? "Si" : "No"}</td>
                      <td>
                        <span className={`status-badge ${cuenta.activa ? "activa" : "inactiva"}`}>
                          {cuenta.activa ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {cuentas.length === 0 && <EmptyRow colSpan={5} />}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!error && !loading && vista === "diario" && (
          <>
            <h3>Libro diario</h3>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Numero</th>
                    <th>Concepto</th>
                    <th>Cuenta</th>
                    <th>Debe</th>
                    <th>Haber</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {libroDiario.map((fila, index) => (
                    <tr key={`${fila.numero}-${fila.cuentaCodigo}-${index}`}>
                      <td>{formatDate(fila.fecha)}</td>
                      <td>{fila.numero}</td>
                      <td>{fila.concepto}</td>
                      <td>{fila.cuentaCodigo} - {fila.cuentaNombre}</td>
                      <td>{formatMoney(fila.debe)}</td>
                      <td>{formatMoney(fila.haber)}</td>
                      <td>{fila.origen}</td>
                    </tr>
                  ))}
                  {libroDiario.length === 0 && <EmptyRow colSpan={7} />}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!error && !loading && vista === "mayor" && (
          <>
            <div className="filters-bar">
              <select value={cuentaMayorId} onChange={(e) => setCuentaMayorId(e.target.value)}>
                <option value="">Todas las cuentas</option>
                {cuentasImputables.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {cuenta.codigo} - {cuenta.nombre}
                  </option>
                ))}
              </select>
            </div>

            {libroMayor.map((grupo) => (
              <div className="table-card table-card-separated" key={grupo.cuentaId}>
                <table>
                  <thead>
                    <tr>
                      <th colSpan={4}>{grupo.cuentaCodigo} - {grupo.cuentaNombre}</th>
                      <th>{formatMoney(grupo.totalDebe)}</th>
                      <th>{formatMoney(grupo.totalHaber)}</th>
                      <th>{formatMoney(grupo.saldoFinal)}</th>
                    </tr>
                    <tr>
                      <th>Fecha</th>
                      <th>Numero</th>
                      <th>Concepto</th>
                      <th>Descripcion</th>
                      <th>Debe</th>
                      <th>Haber</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.movimientos.map((mov, index) => (
                      <tr key={`${grupo.cuentaId}-${mov.numero}-${index}`}>
                        <td>{formatDate(mov.fecha)}</td>
                        <td>{mov.numero}</td>
                        <td>{mov.concepto}</td>
                        <td>{mov.descripcion || "-"}</td>
                        <td>{formatMoney(mov.debe)}</td>
                        <td>{formatMoney(mov.haber)}</td>
                        <td>{formatMoney(mov.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {libroMayor.length === 0 && (
              <div className="table-card">
                <table>
                  <tbody>
                    <EmptyRow colSpan={7} />
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {!error && !loading && vista === "balance" && (
          <>
            <h3>Balance de sumas y saldos</h3>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Cuenta</th>
                    <th>Tipo</th>
                    <th>Suma debe</th>
                    <th>Suma haber</th>
                    <th>Saldo deudor</th>
                    <th>Saldo acreedor</th>
                  </tr>
                </thead>
                <tbody>
                  {balance.map((fila) => (
                    <tr key={fila.cuentaCodigo}>
                      <td>{fila.cuentaCodigo}</td>
                      <td>{fila.cuentaNombre}</td>
                      <td>{fila.tipo}</td>
                      <td>{formatMoney(fila.sumaDebe)}</td>
                      <td>{formatMoney(fila.sumaHaber)}</td>
                      <td>{formatMoney(fila.saldoDeudor)}</td>
                      <td>{formatMoney(fila.saldoAcreedor)}</td>
                    </tr>
                  ))}
                  {balance.length === 0 && <EmptyRow colSpan={7} />}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
