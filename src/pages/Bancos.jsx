import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  GitCompare,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  Link2,
  Unlink,
  ExternalLink,
  Eye,
  CheckCircle2,
} from "lucide-react";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Modal from "../components/Modal";
import { getSedes } from "../services/sedeService";
import { getIngresos } from "../services/ingresoService";
import { getEgresos } from "../services/egresoService";
import { createDocumento, getDocumentos } from "../services/documentoService";
import { uploadArchivo, getSignedArchivoUrl } from "../services/storageService";

import {
  conciliarMovimientoConEgreso,
  conciliarMovimientoConIngreso,
  desconciliarMovimientoBancario,
  createMovimientoBancario,
  createMovimientosBancariosBulk,
  deleteMovimientoBancario,
  getMovimientosBancarios,
  getMovimientosBancariosByHashes,
} from "../services/bancoService";

import {
  createCuentaBancaria,
  deleteCuentaBancaria,
  getCuentasBancarias,
  updateCuentaBancaria,
} from "../services/cuentaBancariaService";

import {
  extractTextFromPdf,
  parseBankStatement,
  buildBankMovementHash,
} from "../utils/bankStatementParser";
import { getDbSedeId } from "../utils/sedeUtils";

const emptyForm = {
  fecha: new Date().toISOString().split("T")[0],
  sedeId: "",
  cuenta: "",
  tipo: "Ingreso",
  descripcion: "",
  importe: "",
  origen: "Carga manual",
  estado: "Pendiente",
};

const emptyCuentaForm = {
  nombre: "",
  tipo: "Banco",
  sedeId: "",
};

const formatMoney = (value = 0) =>
  `$ ${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (fecha) => {
  if (!fecha) return "-";

  const clean = String(fecha).includes("T") ? fecha.split("T")[0] : fecha;

  if (clean.includes("/")) return clean;

  const [year, month, day] = clean.split("-");

  if (!year || !month || !day) return clean;

  return `${day}/${month}/${year}`;
};

const toDate = (fecha) => {
  if (!fecha) return null;

  const clean = String(fecha).includes("T") ? fecha.split("T")[0] : fecha;

  if (clean.includes("/")) {
    const [day, month, year] = clean.split("/");
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }

  return new Date(`${clean}T00:00:00`);
};

const getFechaReal = (item) => item.fechaDb || item.fecha;

const safeFileName = (text) =>
  String(text || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_");

const getSignedAmount = (mov) =>
  mov.tipo === "Egreso"
    ? -Number(mov.importe || 0)
    : Number(mov.importe || 0);

const diferenciaImporte = (movimiento, comprobante) =>
  Math.abs(Number(movimiento?.importe || 0) - Number(comprobante?.importe || 0));

const diferenciaDias = (fechaA, fechaB) => {
  const a = toDate(fechaA);
  const b = toDate(fechaB);

  if (!a || !b) return 9999;

  return Math.abs(Math.round((a - b) / (1000 * 60 * 60 * 24)));
};

const normalizarTexto = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function sedesCompatibles(mov, comprobante) {
  if (!mov?.sedeId) return true;
  if (!comprobante?.sedeId) return true;
  return mov.sedeId === comprobante.sedeId;
}

function getComprobanteTexto(item) {
  return normalizarTexto(
    [
      item?.concepto,
      item?.descripcion,
      item?.proveedor,
      item?.sociedad,
      item?.paciente,
      item?.observaciones,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getMovimientoTexto(mov) {
  return normalizarTexto([mov?.descripcion, mov?.origen].filter(Boolean).join(" "));
}

function calcularPuntajeConciliacion(mov, comprobante) {
  const diffImporte = diferenciaImporte(mov, comprobante);
  const diffDias = diferenciaDias(getFechaReal(mov), getFechaReal(comprobante));

  if (diffImporte > 0.01) return null;
  if (diffDias > 10) return null;
  if (!sedesCompatibles(mov, comprobante)) return null;

  const movText = getMovimientoTexto(mov);
  const compText = getComprobanteTexto(comprobante);

  let textoScore = 0;

  if (movText && compText) {
    const palabras = compText
      .split(" ")
      .filter((word) => word.length >= 4)
      .slice(0, 12);

    const coincidencias = palabras.filter((word) => movText.includes(word)).length;
    textoScore = coincidencias;
  }

  return {
    diffImporte,
    diffDias,
    textoScore,
    puntaje: diffDias * 10 - textoScore,
  };
}

function formatFileSize(bytes) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusClass(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(" ", "-");
}

const normalizeText = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function getCuentaNombreSugerida(parsed) {
  const banco = parsed?.banco || parsed?.detected?.banco || "";

  if (normalizeText(banco).includes("bbva")) return "BBVA";
  if (normalizeText(banco).includes("galicia")) return "Banco Galicia";
  if (normalizeText(banco).includes("macro")) return "Banco Macro";

  return banco || "Cuenta bancaria";
}

function findCuentaCompatible(cuentas, parsed, cuentaFiltro) {
  if (cuentaFiltro && cuentaFiltro !== "Todas") {
    return cuentaFiltro;
  }

  const nombreSugerido = getCuentaNombreSugerida(parsed);
  const bancoNormalizado = normalizeText(nombreSugerido);
  const cuentaDetectada = normalizeText(parsed?.cuentaDetectada);
  const cbuDetectado = normalizeText(parsed?.cbuDetectado);

  const cuentaEncontrada = cuentas.find((cuenta) => {
    const nombre = normalizeText(cuenta.nombre);

    return (
      nombre === bancoNormalizado ||
      nombre.includes(bancoNormalizado) ||
      bancoNormalizado.includes(nombre) ||
      (cuentaDetectada && nombre.includes(cuentaDetectada)) ||
      (cbuDetectado && nombre.includes(cbuDetectado))
    );
  });

  return cuentaEncontrada?.nombre || nombreSugerido;
}

export default function Bancos({ selectedSede, dbSedeId }) {
  const extractoInputRef = useRef(null);

  const [movimientos, setMovimientos] = useState([]);
  const [extractos, setExtractos] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [egresos, setEgresos] = useState([]);

  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [cuentaFiltro, setCuentaFiltro] = useState("Todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [cuentaForm, setCuentaForm] = useState(emptyCuentaForm);
  const [cuentaEditando, setCuentaEditando] = useState(null);
  const [movimientoAConciliar, setMovimientoAConciliar] = useState(null);
  const [comprobanteSeleccionadoId, setComprobanteSeleccionadoId] = useState("");
  const [extractoPendiente, setExtractoPendiente] = useState(null);

  const [extractoParseado, setExtractoParseado] = useState(null);
  const [movimientosPreview, setMovimientosPreview] = useState([]);
  const [parseandoExtracto, setParseandoExtracto] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [importandoExtracto, setImportandoExtracto] = useState(false);
  const [openingExtractoId, setOpeningExtractoId] = useState(null);

  const [autoConciliando, setAutoConciliando] = useState(false);

  const selectedSedeName = selectedSede?.nombre || "Todas las sedes";

  const idSedeActiva = dbSedeId ?? getDbSedeId(selectedSede);
  const sedeBloqueada = Boolean(idSedeActiva);

  async function loadData(currentSedeId = idSedeActiva) {
    setLoading(true);

    try {
      const idParaFiltro = getDbSedeId(currentSedeId);

      const [
        movimientosData,
        sedesData,
        cuentasData,
        ingresosData,
        egresosData,
        documentosData,
      ] = await Promise.all([
        getMovimientosBancarios(idParaFiltro),
        getSedes(),
        getCuentasBancarias(idParaFiltro),
        getIngresos(idParaFiltro),
        getEgresos(idParaFiltro),
        getDocumentos(idParaFiltro),
      ]);

      setMovimientos(movimientosData || []);
      setSedes(sedesData || []);
      setCuentas(cuentasData || []);
      setIngresos(ingresosData || []);
      setEgresos(egresosData || []);
      setExtractos(
        (documentosData || []).filter((doc) => doc.tipo === "Extracto bancario")
      );

      setForm((prev) => ({
        ...prev,
        sedeId: prev.sedeId || idParaFiltro || sedesData?.[0]?.id || "",
        cuenta: prev.cuenta || cuentasData?.[0]?.nombre || "",
      }));

      setCuentaForm((prev) => ({
        ...prev,
        sedeId: prev.sedeId || idParaFiltro || sedesData?.[0]?.id || "",
      }));
    } catch (error) {
      console.error("Error cargando bancos:", error);
      alert(error.message || "No se pudieron cargar los movimientos bancarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => loadData(idSedeActiva));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSedeActiva]);

  const cuentasPorSede = useMemo(() => {
    return cuentas.filter((cuenta) => cuenta.activa);
  }, [cuentas]);

  const movimientosPorSede = movimientos;

  const movimientosFiltrados = useMemo(() => {
    const searchValue = search.toLowerCase().trim();
    const fechaDesde = toDate(desde);
    const fechaHasta = toDate(hasta);

    return movimientosPorSede.filter((mov) => {
      const fechaMov = toDate(getFechaReal(mov));
      const estaVinculado = Boolean(mov.ingresoId || mov.egresoId);

      const matchSearch =
        !searchValue ||
        mov.cuenta?.toLowerCase().includes(searchValue) ||
        mov.descripcion?.toLowerCase().includes(searchValue) ||
        mov.origen?.toLowerCase().includes(searchValue) ||
        mov.sede?.toLowerCase().includes(searchValue);

      const matchEstado =
        estadoFiltro === "Todos" ||
        mov.estado === estadoFiltro ||
        (estadoFiltro === "Vinculado" && estaVinculado) ||
        (estadoFiltro === "Sin vincular" && !estaVinculado);

      const matchTipo = tipoFiltro === "Todos" || mov.tipo === tipoFiltro;
      const matchCuenta = cuentaFiltro === "Todas" || mov.cuenta === cuentaFiltro;
      const matchDesde = !fechaDesde || (fechaMov && fechaMov >= fechaDesde);
      const matchHasta = !fechaHasta || (fechaMov && fechaMov <= fechaHasta);

      return (
        matchSearch &&
        matchEstado &&
        matchTipo &&
        matchCuenta &&
        matchDesde &&
        matchHasta
      );
    });
  }, [
    movimientosPorSede,
    search,
    estadoFiltro,
    tipoFiltro,
    cuentaFiltro,
    desde,
    hasta,
  ]);

  const totalIngresos = movimientosFiltrados
    .filter((m) => m.tipo === "Ingreso")
    .reduce((acc, m) => acc + Number(m.importe || 0), 0);

  const totalEgresos = movimientosFiltrados
    .filter((m) => m.tipo === "Egreso")
    .reduce((acc, m) => acc + Number(m.importe || 0), 0);

  const saldoOperativo = totalIngresos - totalEgresos;

  const movimientosPendientes = movimientosFiltrados.filter(
    (m) => m.estado !== "Conciliado"
  );

  const movimientosVinculados = movimientosFiltrados.filter(
    (m) => m.ingresoId || m.egresoId
  );

  const movimientosSinIdentificar = movimientosFiltrados.filter(
    (m) => m.estado === "Movimiento sin identificar"
  );

  const resumenPorCuenta = useMemo(() => {
    const map = {};

    movimientosFiltrados.forEach((mov) => {
      if (!map[mov.cuenta]) {
        map[mov.cuenta] = {
          cuenta: mov.cuenta,
          ingresos: 0,
          egresos: 0,
          saldo: 0,
          pendientes: 0,
          vinculados: 0,
          movimientos: 0,
        };
      }

      if (mov.tipo === "Ingreso") {
        map[mov.cuenta].ingresos += Number(mov.importe || 0);
      } else {
        map[mov.cuenta].egresos += Number(mov.importe || 0);
      }

      map[mov.cuenta].saldo += getSignedAmount(mov);
      map[mov.cuenta].movimientos += 1;

      if (mov.estado !== "Conciliado") map[mov.cuenta].pendientes += 1;
      if (mov.ingresoId || mov.egresoId) map[mov.cuenta].vinculados += 1;
    });

    return Object.values(map).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
  }, [movimientosFiltrados]);

  const candidatosConciliacion = useMemo(() => {
    if (!movimientoAConciliar) return [];

    const base = movimientoAConciliar.tipo === "Ingreso" ? ingresos : egresos;
    const estadoAplicado =
      movimientoAConciliar.tipo === "Ingreso" ? "Cobrado" : "Pagado";

    return base
      .filter((item) => {
        if (item.sedeId !== movimientoAConciliar.sedeId) return false;
        if (item.estado === estadoAplicado) return false;
        return true;
      })
      .map((item) => {
        const diffImporte = diferenciaImporte(movimientoAConciliar, item);
        const diffDias = diferenciaDias(
          getFechaReal(movimientoAConciliar),
          getFechaReal(item)
        );
        const matchExacto = diffImporte === 0;
        const sugerido = matchExacto && diffDias <= 10;

        return {
          ...item,
          diffImporte,
          diffDias,
          sugerido,
          puntaje: (matchExacto ? 0 : diffImporte) + diffDias * 100,
        };
      })
      .sort((a, b) => a.puntaje - b.puntaje)
      .slice(0, 30);
  }, [movimientoAConciliar, ingresos, egresos]);

  const sugerenciasConciliacionAuto = useMemo(() => {
    const usadosIngresos = new Set();
    const usadosEgresos = new Set();

    return movimientosFiltrados
      .filter((mov) => {
        if (mov.estado === "Conciliado") return false;
        if (mov.ingresoId || mov.egresoId) return false;
        return mov.tipo === "Ingreso" || mov.tipo === "Egreso";
      })
      .map((mov) => {
        const base = mov.tipo === "Ingreso" ? ingresos : egresos;
        const usados = mov.tipo === "Ingreso" ? usadosIngresos : usadosEgresos;
        const estadoAplicado = mov.tipo === "Ingreso" ? "Cobrado" : "Pagado";

        const candidatos = base
          .filter((item) => {
            if (!item?.id) return false;
            if (usados.has(item.id)) return false;
            if (item.estado === estadoAplicado) return false;

            const score = calcularPuntajeConciliacion(mov, item);
            return Boolean(score);
          })
          .map((item) => ({
            item,
            score: calcularPuntajeConciliacion(mov, item),
          }))
          .filter((row) => row.score)
          .sort((a, b) => a.score.puntaje - b.score.puntaje);

        if (candidatos.length === 0) return null;

        const mejor = candidatos[0];
        const segundo = candidatos[1];

        const ambiguo =
          segundo &&
          mejor.score.diffImporte === segundo.score.diffImporte &&
          mejor.score.diffDias === segundo.score.diffDias &&
          mejor.score.textoScore === segundo.score.textoScore;

        if (ambiguo) {
          return {
            movimiento: mov,
            candidato: mejor.item,
            score: mejor.score,
            ambiguo: true,
          };
        }

        usados.add(mejor.item.id);

        return {
          movimiento: mov,
          candidato: mejor.item,
          score: mejor.score,
          ambiguo: false,
        };
      })
      .filter(Boolean);
  }, [movimientosFiltrados, ingresos, egresos]);

  useEffect(() => {
    const sugerido = candidatosConciliacion.find((item) => item.sugerido);

    queueMicrotask(() => {
      setComprobanteSeleccionadoId(
        sugerido?.id || candidatosConciliacion[0]?.id || ""
      );
    });
  }, [candidatosConciliacion]);

  const nombreArchivo = useMemo(() => {
    const periodo =
      desde || hasta
        ? `${desde || "inicio"}_${hasta || "actual"}`
        : "todos_los_periodos";

    return `Bancos_${safeFileName(selectedSedeName)}_${safeFileName(periodo)}`;
  }, [selectedSedeName, desde, hasta]);

  function aplicarFiltroRapido(tipo) {
    const hoy = new Date();
    const isoHoy = hoy.toISOString().split("T")[0];

    if (tipo === "hoy") {
      setDesde(isoHoy);
      setHasta(isoHoy);
    }

    if (tipo === "mes") {
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      setDesde(inicioMes);
      setHasta(isoHoy);
    }

    if (tipo === "pendientes") setEstadoFiltro("Pendiente");
    if (tipo === "sin-vincular") setEstadoFiltro("Sin vincular");

    if (tipo === "limpiar") {
      setSearch("");
      setEstadoFiltro("Todos");
      setTipoFiltro("Todos");
      setCuentaFiltro("Todas");
      setDesde("");
      setHasta("");
    }
  }

  function openNuevoMovimiento() {
    setForm({
      ...emptyForm,
      sedeId: sedeBloqueada ? idSedeActiva : sedes[0]?.id || "",
      cuenta: cuentasPorSede[0]?.nombre || cuentas[0]?.nombre || "",
    });

    setModal("nuevo");
  }

  function openNuevaCuenta() {
    setCuentaEditando(null);
    setCuentaForm({
      ...emptyCuentaForm,
      sedeId: sedeBloqueada ? idSedeActiva : sedes[0]?.id || "",
    });

    setModal("gestionarCuentas");
  }

  function openEditarCuenta(cuenta) {
    setCuentaEditando(cuenta);
    setCuentaForm({
      nombre: cuenta.nombre || "",
      tipo: cuenta.tipo || "Banco",
      sedeId: cuenta.sedeId || "",
      activa: cuenta.activa,
    });

    setModal("gestionarCuentas");
  }

  function cancelarEdicionCuenta() {
    setCuentaEditando(null);
    setCuentaForm({
      ...emptyCuentaForm,
      sedeId: sedeBloqueada ? idSedeActiva : sedes[0]?.id || "",
    });
  }

  function openConciliacion(mov) {
    setMovimientoAConciliar(mov);
    setModal("conciliar");
  }

  async function seleccionarExtracto(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type && file.type !== "application/pdf") {
      alert("Por ahora la lectura automática solo admite extractos PDF digitales.");
      e.target.value = "";
      return;
    }

    setParseandoExtracto(true);
    setImportandoExtracto(true);

    try {
      const text = await extractTextFromPdf(file);
      const parsed = parseBankStatement(text);

      const cuentasDisponibles = cuentasPorSede.length ? cuentasPorSede : cuentas;

      const cuentaSugerida = findCuentaCompatible(
        cuentasDisponibles,
        parsed,
        cuentaFiltro
      );

      let cuentaFinal = cuentaSugerida;

      const existeCuenta = cuentasDisponibles.some(
        (cuenta) => normalizeText(cuenta.nombre) === normalizeText(cuentaSugerida)
      );

      if (!existeCuenta && cuentaSugerida) {
        const nuevaCuenta = await createCuentaBancaria({
          nombre: cuentaSugerida,
          tipo: "Banco",
          sedeId: "",
        });

        cuentaFinal = nuevaCuenta.nombre;

        setCuentas((prev) => {
          const yaExiste = prev.some(
            (cuenta) => normalizeText(cuenta.nombre) === normalizeText(nuevaCuenta.nombre)
          );

          return yaExiste ? prev : [...prev, nuevaCuenta];
        });
      }

      const sedeSugerida = sedeBloqueada ? idSedeActiva : "";

      const previewBase = (parsed.movimientos || []).map((mov, index) => ({
        ...mov,
        previewId: `${Date.now()}-${index}`,
        seleccionado: true,
        sedeId: sedeSugerida,
        cuenta: cuentaFinal,
        estado: "Pendiente",
        origen: mov.origen || `Extracto ${parsed.banco}`,
      }));

      const preview = await prepararPreviewConDuplicados(previewBase);

      setExtractoPendiente({
        fecha: new Date().toISOString().split("T")[0],
        tipo: "Extracto bancario",
        descripcion: parsed.banco
          ? `Extracto ${parsed.banco} - ${file.name}`
          : `Extracto bancario - ${file.name}`,
        asociadoA: cuentaFinal,
        sedeId: sedeSugerida,
        archivo: file.name,
        archivoPath: "",
        archivoTipo: file.type || "",
        archivoSize: file.size || 0,
        estado: "Pendiente revisión",
        file,
        datosFiscales: {
          banco: parsed.banco,
          tipoDocumento: parsed.detected?.tipoDocumento,
          cuentaDetectada: parsed.cuentaDetectada,
          cbuDetectado: parsed.cbuDetectado,
          movimientosDetectados: preview.length,
        },
      });

      setExtractoParseado(parsed);
      setMovimientosPreview(preview);
      setModal("revisarExtracto");
    } catch (error) {
      console.error("Error leyendo extracto:", error);
      alert(
        error.message ||
        "No se pudo leer el PDF. Verificá que sea un PDF digital y no una imagen escaneada."
      );
    } finally {
      setParseandoExtracto(false);
      setImportandoExtracto(false);
      e.target.value = "";
    }
  }

  function updateMovimientoPreview(previewId, field, value) {
    setMovimientosPreview((prev) =>
      prev.map((mov) =>
        mov.previewId === previewId
          ? {
            ...mov,
            [field]: value,
            estadoImportacion:
              mov.duplicadoSistema || mov.duplicadoArchivo
                ? "Editado - revisar"
                : mov.estadoImportacion,
          }
          : mov
      )
    );
  }

  function toggleMovimientoPreview(previewId) {
    setMovimientosPreview((prev) =>
      prev.map((mov) =>
        mov.previewId === previewId
          ? { ...mov, seleccionado: !mov.seleccionado }
          : mov
      )
    );
  }

  function seleccionarTodosPreview(value) {
    setMovimientosPreview((prev) =>
      prev.map((mov) => ({
        ...mov,
        seleccionado:
          value && !mov.duplicadoSistema && !mov.duplicadoArchivo,
      }))
    );
  }

  async function prepararPreviewConDuplicados(movimientosBase) {
    const conHash = await Promise.all(
      movimientosBase.map(async (mov) => ({
        ...mov,
        externalHash: await buildBankMovementHash(mov),
      }))
    );

    const hashes = conHash.map((mov) => mov.externalHash);
    const existentes = await getMovimientosBancariosByHashes(hashes);
    const hashesExistentes = new Set(
      existentes.map((mov) => mov.externalHash).filter(Boolean)
    );

    const contadorLocal = {};

    return conHash.map((mov) => {
      contadorLocal[mov.externalHash] = (contadorLocal[mov.externalHash] || 0) + 1;

      const duplicadoSistema = hashesExistentes.has(mov.externalHash);
      const duplicadoArchivo = contadorLocal[mov.externalHash] > 1;

      return {
        ...mov,
        seleccionado: !duplicadoSistema && !duplicadoArchivo,
        duplicadoSistema,
        duplicadoArchivo,
        estadoImportacion: duplicadoSistema
          ? "Ya importado"
          : duplicadoArchivo
            ? "Duplicado en PDF"
            : "Nuevo",
      };
    });
  }

  async function confirmarExtractoImportado(e) {
    e.preventDefault();

    if (!extractoPendiente?.descripcion?.trim()) {
      alert("Debés cargar una descripción para el extracto.");
      return;
    }

    if (!extractoPendiente?.file) {
      alert("No hay archivo seleccionado.");
      return;
    }

    const movimientosSeleccionados = movimientosPreview.filter(
      (mov) =>
        mov.seleccionado &&
        !mov.duplicadoSistema &&
        !mov.duplicadoArchivo
    );

    if (movimientosPreview.length > 0 && movimientosSeleccionados.length === 0) {
      alert("No hay movimientos seleccionados para importar.");
      return;
    }

    const movimientosInvalidos = movimientosSeleccionados.filter(
      (mov) => !mov.fecha || !mov.cuenta || !mov.descripcion || !mov.importe
    );

    if (movimientosInvalidos.length > 0) {
      alert(
        "Hay movimientos con datos incompletos. Revisá fecha, sede, cuenta, descripción e importe."
      );
      return;
    }

    setSaving(true);
    setImportandoExtracto(true);

    try {
      const uploaded = await uploadArchivo(
        extractoPendiente.file,
        "bancos/extractos"
      );

      await createDocumento({
        ...extractoPendiente,
        archivo: uploaded.nombre,
        archivoPath: uploaded.path,
        archivoTipo: uploaded.tipo,
        archivoSize: uploaded.size,
        estado:
          movimientosSeleccionados.length > 0
            ? "Validado"
            : extractoPendiente.estado,
        file: undefined,
      });

      const movimientosParaCrear = movimientosSeleccionados.map((mov) => ({
        fecha: mov.fecha,
        sedeId: mov.sedeId,
        cuenta: mov.cuenta,
        tipo: mov.tipo,
        descripcion: mov.descripcion,
        importe: mov.importe,
        origen: mov.origen || `Extracto ${extractoParseado?.banco || "bancario"}`,
        estado: mov.estado || "Pendiente",
        externalHash: mov.externalHash,
        metadata: {
          fuente: "extracto_pdf",
          banco: extractoParseado?.banco || null,
          cuentaDetectada: extractoParseado?.cuentaDetectada || null,
          cbuDetectado: extractoParseado?.cbuDetectado || null,
          archivo: extractoPendiente?.archivo || null,
          saldoPdf: mov.saldo ?? null,
          debitoPdf: mov.debito ?? null,
          creditoPdf: mov.credito ?? null,
        },
      }));

      if (movimientosParaCrear.length > 0) {
        await createMovimientosBancariosBulk(movimientosParaCrear);
      }

      await loadData(idSedeActiva);

      setExtractoPendiente(null);
      setExtractoParseado(null);
      setMovimientosPreview([]);
      setModal(null);
    } catch (error) {
      console.error("Error guardando extracto:", error);

      const message =
        error?.message ||
        error?.error_description ||
        error?.details ||
        error?.hint ||
        JSON.stringify(error) ||
        "No se pudo guardar el extracto.";

      alert(message);
    } finally {
      setSaving(false);
      setImportandoExtracto(false);
    }
  }

  async function abrirExtracto(extracto) {
    if (!extracto.archivoPath) {
      alert("Este extracto no tiene archivo almacenado.");
      return;
    }

    setOpeningExtractoId(extracto.id);

    try {
      const url = await getSignedArchivoUrl(extracto.archivoPath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Error abriendo extracto:", error);
      alert(error.message || "No se pudo abrir el extracto.");
    } finally {
      setOpeningExtractoId(null);
    }
  }

  async function handleConfirmarConciliacion() {
    if (!movimientoAConciliar || !comprobanteSeleccionadoId) return;

    setSaving(true);

    try {
      if (movimientoAConciliar.tipo === "Ingreso") {
        await conciliarMovimientoConIngreso(
          movimientoAConciliar.id,
          comprobanteSeleccionadoId
        );
      } else {
        await conciliarMovimientoConEgreso(
          movimientoAConciliar.id,
          comprobanteSeleccionadoId
        );
      }

      await loadData(idSedeActiva);
      setModal(null);
      setMovimientoAConciliar(null);
      setComprobanteSeleccionadoId("");
    } catch (error) {
      console.error("Error conciliando movimiento:", error);
      alert(error.message || "No se pudo conciliar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConciliacionAutomatica() {
    const aplicables = sugerenciasConciliacionAuto.filter((item) => !item.ambiguo);

    if (aplicables.length === 0) {
      alert("No hay conciliaciones automáticas confiables para aplicar.");
      return;
    }

    const ok = window.confirm(
      `Se van a conciliar automáticamente ${aplicables.length} movimientos con coincidencia exacta de importe y fecha cercana. ¿Continuar?`
    );

    if (!ok) return;

    setAutoConciliando(true);

    try {
      for (const sug of aplicables) {
        if (sug.movimiento.tipo === "Ingreso") {
          await conciliarMovimientoConIngreso(sug.movimiento.id, sug.candidato.id);
        } else {
          await conciliarMovimientoConEgreso(sug.movimiento.id, sug.candidato.id);
        }
      }

      await loadData(idSedeActiva);
      alert(`Conciliación automática finalizada: ${aplicables.length} movimientos conciliados.`);
    } catch (error) {
      console.error("Error conciliando automáticamente:", error);
      alert(error.message || "No se pudo completar la conciliación automática.");
    } finally {
      setAutoConciliando(false);
    }
  }

  async function handleDesconciliar(mov) {
    const ok = window.confirm("¿Quitar el vínculo de conciliación de este movimiento?");
    if (!ok) return;

    try {
      await desconciliarMovimientoBancario(mov.id);
      await loadData(idSedeActiva);
    } catch (error) {
      alert(error.message || "No se pudo desconciliar el movimiento.");
    }
  }

  async function handleCreate(e) {
    e.preventDefault();

    setSaving(true);

    try {
      await createMovimientoBancario(form);
      await loadData(idSedeActiva);

      setForm({
        ...emptyForm,
        sedeId: sedeBloqueada ? idSedeActiva : sedes[0]?.id || "",
        cuenta: cuentasPorSede[0]?.nombre || cuentas[0]?.nombre || "",
      });

      setModal(null);
    } catch (error) {
      alert(error.message || "No se pudo crear el movimiento bancario.");
    } finally {
      setSaving(false);
    }
  }

  function handleConciliar() {
    setEstadoFiltro("Sin vincular");
  }

  async function handleDelete(id) {
    const confirmDelete = window.confirm("¿Eliminar este movimiento bancario?");
    if (!confirmDelete) return;

    setDeletingId(id);

    try {
      await deleteMovimientoBancario(id);
      await loadData(idSedeActiva);
    } catch (error) {
      alert(error.message || "No se pudo eliminar el movimiento.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreateCuenta(e) {
    e.preventDefault();

    setSaving(true);

    try {
      await createCuentaBancaria(cuentaForm);
      await loadData(idSedeActiva);

      setCuentaForm({
        ...emptyCuentaForm,
        sedeId: sedeBloqueada ? idSedeActiva : sedes[0]?.id || "",
      });
    } catch (error) {
      alert(error.message || "No se pudo crear la cuenta bancaria.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCuenta(e) {
    e.preventDefault();
    if (!cuentaEditando) return;

    setSaving(true);

    try {
      await updateCuentaBancaria(cuentaEditando.id, cuentaForm);
      await loadData(idSedeActiva);

      setCuentaEditando(null);
      setCuentaForm({
        ...emptyCuentaForm,
        sedeId: sedeBloqueada ? idSedeActiva : sedes[0]?.id || "",
      });
    } catch (error) {
      alert(error.message || "No se pudo modificar la cuenta bancaria.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCuenta(cuenta) {
    const ok = window.confirm(
      `¿Eliminar la cuenta bancaria "${cuenta.nombre}"? Si tiene movimientos cargados, se desactivará para conservar el historial.`
    );
    if (!ok) return;

    setDeletingId(cuenta.id);

    try {
      const result = await deleteCuentaBancaria(cuenta.id);
      await loadData(idSedeActiva);

      if (result.deactivated) {
        alert(`La cuenta tenía ${result.movimientos} movimiento(s), por eso quedó desactivada.`);
      }
    } catch (error) {
      alert(error.message || "No se pudo eliminar la cuenta bancaria.");
    } finally {
      setDeletingId(null);
    }
  }

  const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CEDIM - TECNEW";
    workbook.created = new Date();

    const resumenSheet = workbook.addWorksheet("Resumen");
    resumenSheet.columns = [
      { header: "Indicador", key: "indicador", width: 35 },
      { header: "Valor", key: "valor", width: 22 },
    ];

    resumenSheet.addRows([
      { indicador: "Sede", valor: selectedSedeName },
      { indicador: "Ingresos bancarios", valor: totalIngresos },
      { indicador: "Egresos bancarios", valor: totalEgresos },
      { indicador: "Saldo operativo", valor: saldoOperativo },
      { indicador: "Pendientes", valor: movimientosPendientes.length },
      { indicador: "Vinculados", valor: movimientosVinculados.length },
      { indicador: "Sin identificar", valor: movimientosSinIdentificar.length },
      { indicador: "Extractos adjuntos", valor: extractos.length },
    ]);

    const cuentasSheet = workbook.addWorksheet("Resumen por cuenta");
    cuentasSheet.columns = [
      { header: "Cuenta", key: "cuenta", width: 32 },
      { header: "Ingresos", key: "ingresos", width: 18 },
      { header: "Egresos", key: "egresos", width: 18 },
      { header: "Saldo", key: "saldo", width: 18 },
      { header: "Pendientes", key: "pendientes", width: 14 },
      { header: "Vinculados", key: "vinculados", width: 14 },
      { header: "Movimientos", key: "movimientos", width: 14 },
    ];

    cuentasSheet.addRows(resumenPorCuenta);

    const movimientosSheet = workbook.addWorksheet("Movimientos");
    movimientosSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Sede", key: "sede", width: 24 },
      { header: "Cuenta", key: "cuenta", width: 28 },
      { header: "Tipo", key: "tipo", width: 14 },
      { header: "Descripción", key: "descripcion", width: 44 },
      { header: "Importe", key: "importe", width: 18 },
      { header: "Origen", key: "origen", width: 22 },
      { header: "Estado", key: "estado", width: 20 },
      { header: "Vínculo", key: "vinculo", width: 22 },
    ];

    movimientosSheet.addRows(
      movimientosFiltrados.map((mov) => ({
        fecha: formatDate(getFechaReal(mov)),
        sede: mov.sede,
        cuenta: mov.cuenta,
        tipo: mov.tipo,
        descripcion: mov.descripcion,
        importe: mov.tipo === "Egreso" ? -mov.importe : mov.importe,
        origen: mov.origen,
        estado: mov.estado,
        vinculo: mov.ingresoId
          ? `Ingreso ${mov.ingresoId}`
          : mov.egresoId
            ? `Egreso ${mov.egresoId}`
            : "Sin vincular",
      }))
    );

    const extractosSheet = workbook.addWorksheet("Extractos");
    extractosSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Sede", key: "sede", width: 24 },
      { header: "Cuenta / asociado", key: "asociadoA", width: 28 },
      { header: "Descripción", key: "descripcion", width: 44 },
      { header: "Archivo", key: "archivo", width: 36 },
      { header: "Tipo", key: "archivoTipo", width: 24 },
      { header: "Estado", key: "estado", width: 20 },
    ];

    extractosSheet.addRows(
      extractos.map((ext) => ({
        fecha: ext.fecha,
        sede: ext.sede,
        asociadoA: ext.asociadoA,
        descripcion: ext.descripcion,
        archivo: ext.archivo,
        archivoTipo: ext.archivoTipo,
        estado: ext.estado,
      }))
    );

    workbook.worksheets.forEach((sheet) => {
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A8A" },
      };

      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } },
          };
        })
      );
    });

    [
      resumenSheet.getColumn("valor"),
      cuentasSheet.getColumn("ingresos"),
      cuentasSheet.getColumn("egresos"),
      cuentasSheet.getColumn("saldo"),
      movimientosSheet.getColumn("importe"),
    ].forEach((column) => {
      column.numFmt = '"$"#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const data = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(data, `${nombreArchivo}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("CEDIM", 14, 16);

    doc.setFontSize(15);
    doc.text("Reporte bancario y conciliación", 14, 26);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Reporte generado por plataforma de gestión CEDIM", 14, 32);

    doc.setDrawColor(210);
    doc.line(14, 37, pageWidth - 14, 37);

    doc.text(`Sede: ${selectedSedeName}`, 14, 44);
    doc.text(`Cuenta: ${cuentaFiltro}`, 14, 49);
    doc.text(`Estado: ${estadoFiltro}`, 14, 54);
    doc.text(
      `Periodo: ${desde ? formatDate(desde) : "Inicio"} al ${hasta ? formatDate(hasta) : "Actual"
      }`,
      14,
      59
    );

    doc.setFont("helvetica", "bold");
    doc.text(`Ingresos: ${formatMoney(totalIngresos)}`, 155, 44);
    doc.text(`Egresos: ${formatMoney(totalEgresos)}`, 155, 49);
    doc.text(`Saldo: ${formatMoney(saldoOperativo)}`, 155, 54);
    doc.text(`Vinculados: ${movimientosVinculados.length}`, 155, 59);

    autoTable(doc, {
      startY: 68,
      head: [["Cuenta", "Ingresos", "Egresos", "Saldo", "Pend.", "Vinc.", "Mov."]],
      body: resumenPorCuenta.map((item) => [
        item.cuenta,
        formatMoney(item.ingresos),
        formatMoney(item.egresos),
        formatMoney(item.saldo),
        item.pendientes,
        item.vinculados,
        item.movimientos,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center" },
      },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Fecha", "Sede", "Cuenta", "Tipo", "Descripción", "Importe", "Estado", "Vínculo"]],
      body: movimientosFiltrados.map((mov) => [
        formatDate(getFechaReal(mov)),
        mov.sede,
        mov.cuenta,
        mov.tipo,
        mov.descripcion,
        formatMoney(mov.tipo === "Egreso" ? -mov.importe : mov.importe),
        mov.estado,
        mov.ingresoId ? "Ingreso" : mov.egresoId ? "Egreso" : "Sin vincular",
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      columnStyles: { 5: { halign: "right" } },
    });

    if (extractos.length > 0) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [["Fecha", "Sede", "Cuenta / asociado", "Descripción", "Archivo", "Estado"]],
        body: extractos.map((ext) => [
          ext.fecha,
          ext.sede,
          ext.asociadoA || "-",
          ext.descripcion,
          ext.archivo || "-",
          ext.estado,
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      });
    }

    const pageCount = doc.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text("Generado por plataforma de gestión CEDIM", 14, pageHeight - 8);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - 35, pageHeight - 8);
    }

    doc.save(`${nombreArchivo}.pdf`);
  };

  return (
    <section className="page">
      <div className="page-header" data-tour="bancos-header">
        <div>
          <h2>Bancos y conciliación</h2>
          <p>
            Control de cuentas bancarias, caja, billeteras, extractos y conciliación real contra ingresos/egresos.
          </p>
        </div>

        <div className="header-actions">
          <input
            ref={extractoInputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={seleccionarExtracto}
          />

          <button
            className="secondary-button"
            onClick={() => loadData(idSedeActiva)}
            disabled={loading}
          >
            <RefreshCw size={16} /> Actualizar
          </button>

          <button
            className="secondary-button"
            onClick={() => extractoInputRef.current?.click()}
            disabled={importandoExtracto || parseandoExtracto}
          >
            <Upload size={16} />
            {parseandoExtracto
              ? "Leyendo PDF..."
              : importandoExtracto
                ? "Importando..."
                : "Importar extracto PDF"}
          </button>

          <button className="secondary-button" onClick={handleConciliar}>
            <GitCompare size={16} /> Ver sin vincular
          </button>

          <button
            className="secondary-button"
            onClick={handleConciliacionAutomatica}
            disabled={autoConciliando || sugerenciasConciliacionAuto.filter((s) => !s.ambiguo).length === 0}
          >
            <GitCompare size={16} />
            {autoConciliando
              ? "Conciliando..."
              : `Conciliar auto (${sugerenciasConciliacionAuto.filter((s) => !s.ambiguo).length})`}
          </button>

          <button className="secondary-button" onClick={openNuevaCuenta}>
            <Plus size={16} /> Gestionar cuentas
          </button>

          <button className="primary-button" onClick={openNuevoMovimiento} data-tour="bancos-nuevo">
            <Plus size={16} /> Nuevo movimiento
          </button>
        </div>
      </div>

      <div className="stats-grid small" data-tour="bancos-resumen">
        <div className="stat-card" data-tour="bancos-resumen-ingresos">
          <div>
            <span>Ingresos bancarios</span>
            <strong>{formatMoney(totalIngresos)}</strong>
            <small>
              {movimientosFiltrados.filter((m) => m.tipo === "Ingreso").length} movimientos
            </small>
          </div>
        </div>

        <div className="stat-card" data-tour="bancos-resumen-egresos">
          <div>
            <span>Egresos bancarios</span>
            <strong>{formatMoney(totalEgresos)}</strong>
            <small>
              {movimientosFiltrados.filter((m) => m.tipo === "Egreso").length} movimientos
            </small>
          </div>
        </div>

        <div className="stat-card" data-tour="bancos-resumen-saldo">
          <div>
            <span>Saldo operativo</span>
            <strong>{formatMoney(saldoOperativo)}</strong>
            <small>Ingresos menos egresos</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Extractos adjuntos</span>
            <strong>{extractos.length}</strong>
            <small>Documentos bancarios cargados</small>
          </div>
        </div>
      </div>

      <div className="filters-bar bancos-filters" data-tour="bancos-filtros">
        <input
          placeholder="Buscar por cuenta, descripción, sede u origen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-tour="bancos-busqueda"
        />

        <label className="filter-field">
          <span>Cuenta</span>
          <select value={cuentaFiltro} onChange={(e) => setCuentaFiltro(e.target.value)}>
            <option>Todas</option>
            {cuentasPorSede.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.nombre}>
                {cuenta.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>Tipo</span>
          <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
            <option>Todos</option>
            <option>Ingreso</option>
            <option>Egreso</option>
          </select>
        </label>

        <label className="filter-field">
          <span>Estado</span>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option>Todos</option>
            <option>Conciliado</option>
            <option>Pendiente</option>
            <option>Movimiento sin identificar</option>
            <option>Vinculado</option>
            <option>Sin vincular</option>
          </select>
        </label>

        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />

        <button className="secondary-button" onClick={() => aplicarFiltroRapido("hoy")}>
          Hoy
        </button>

        <button className="secondary-button" onClick={() => aplicarFiltroRapido("mes")}>
          Este mes
        </button>

        <button className="secondary-button" onClick={() => aplicarFiltroRapido("pendientes")}>
          Pendientes
        </button>

        <button className="secondary-button" onClick={() => aplicarFiltroRapido("sin-vincular")}>
          Sin vincular
        </button>

        <button className="secondary-button" onClick={() => aplicarFiltroRapido("limpiar")}>
          Limpiar
        </button>

        <button className="secondary-button" onClick={exportarExcel} disabled={loading}>
          <FileSpreadsheet size={15} /> Excel
        </button>

        <button className="primary-button" onClick={exportarPDF} disabled={loading}>
          <FileText size={15} /> PDF
        </button>
      </div>

      <div className="panel">
        <h3>Resumen por cuenta</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Ingresos</th>
                <th>Egresos</th>
                <th>Saldo</th>
                <th>Pendientes</th>
                <th>Vinculados</th>
                <th>Movimientos</th>
              </tr>
            </thead>

            <tbody>
              {resumenPorCuenta.map((item) => (
                <tr key={item.cuenta}>
                  <td>
                    <strong>{item.cuenta}</strong>
                  </td>
                  <td>{formatMoney(item.ingresos)}</td>
                  <td>{formatMoney(item.egresos)}</td>
                  <td>
                    <strong>{formatMoney(item.saldo)}</strong>
                  </td>
                  <td>{item.pendientes}</td>
                  <td>{item.vinculados}</td>
                  <td>{item.movimientos}</td>
                </tr>
              ))}

              {!loading && resumenPorCuenta.length === 0 && (
                <tr>
                  <td colSpan="7">
                    No hay cuentas con movimientos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" data-tour="bancos-tabla">
        <h3>Movimientos bancarios</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Sede</th>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Importe</th>
                <th>Origen</th>
                <th>Estado</th>
                <th>Vínculo</th>
                <th data-tour="bancos-acciones">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="10">Cargando movimientos bancarios...</td>
                </tr>
              )}

              {!loading &&
                movimientosFiltrados.map((mov, index) => {
                  const vinculado = mov.ingresoId || mov.egresoId;
                  const sugerenciaAuto = sugerenciasConciliacionAuto.find(
                    (sug) => sug.movimiento.id === mov.id
                  );

                  return (
                    <tr key={mov.id}>
                      <td>{formatDate(getFechaReal(mov))}</td>
                      <td>{mov.sede}</td>
                      <td>{mov.cuenta}</td>
                      <td>{mov.tipo}</td>
                      <td>
                        <div>
                          {mov.descripcion}
                          {sugerenciaAuto && (
                            <small className="table-cell-note">
                              Sugerido:{" "}
                              {sugerenciaAuto.candidato.concepto ||
                                sugerenciaAuto.candidato.proveedor ||
                                sugerenciaAuto.candidato.sociedad ||
                                sugerenciaAuto.candidato.descripcion ||
                                "Comprobante"}{" "}
                              · {formatMoney(sugerenciaAuto.candidato.importe)}
                              {sugerenciaAuto.ambiguo ? " · revisar manualmente" : ""}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>
                          {formatMoney(mov.tipo === "Egreso" ? -mov.importe : mov.importe)}
                        </strong>
                      </td>
                      <td>{mov.origen}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(mov.estado)}`}>
                          {mov.estado}
                        </span>
                      </td>
                      <td>
                        {vinculado ? (
                          <span className="status-badge aplicado">
                            {mov.ingresoId ? "Ingreso vinculado" : "Egreso vinculado"}
                          </span>
                        ) : sugerenciaAuto ? (
                          <span className={`status-badge ${sugerenciaAuto.ambiguo ? "pendiente" : "normal"}`}>
                            {sugerenciaAuto.ambiguo ? "Sugerencia ambigua" : "Sugerido auto"}
                          </span>
                        ) : (
                          <span className="status-badge pendiente">Sin vincular</span>
                        )}
                      </td>
                      <td>
                        <div className="table-actions" data-tour={index === 0 ? "bancos-acciones" : undefined}>
                          {!vinculado && (
                            <button title="Conciliar" onClick={() => openConciliacion(mov)}>
                              <Link2 size={16} />
                            </button>
                          )}

                          {vinculado && (
                            <button title="Desconciliar" onClick={() => handleDesconciliar(mov)}>
                              <Unlink size={16} />
                            </button>
                          )}

                          <button
                            title="Eliminar movimiento"
                            onClick={() => handleDelete(mov.id)}
                            disabled={deletingId === mov.id}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && movimientosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="10">No se encontraron movimientos bancarios.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Extractos bancarios adjuntos</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Sede</th>
                <th>Cuenta / asociado a</th>
                <th>Descripción</th>
                <th>Archivo</th>
                <th>Tamaño</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8">Cargando extractos...</td>
                </tr>
              )}

              {!loading &&
                extractos.map((extracto) => (
                  <tr key={extracto.id}>
                    <td>{extracto.fecha}</td>
                    <td>{extracto.sede}</td>
                    <td>{extracto.asociadoA || "-"}</td>
                    <td>{extracto.descripcion}</td>
                    <td>{extracto.archivo || "-"}</td>
                    <td>{formatFileSize(extracto.archivoSize)}</td>
                    <td>
                      <span className={`status-badge ${getStatusClass(extracto.estado)}`}>
                        {extracto.estado}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          title="Abrir extracto"
                          onClick={() => abrirExtracto(extracto)}
                          disabled={openingExtractoId === extracto.id}
                        >
                          <ExternalLink size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && extractos.length === 0 && (
                <tr>
                  <td colSpan="8">No hay extractos adjuntos para esta sede.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "nuevo" && (
        <Modal title="Nuevo movimiento bancario" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              Fecha
              <input
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </label>

            <label>
              Sede
              <select
                value={form.sedeId}
                onChange={(e) => setForm({ ...form, sedeId: e.target.value })}
                disabled={sedeBloqueada}
                required
              >
                <option value="">Seleccionar sede</option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Cuenta
              <select
                required
                value={form.cuenta}
                onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
              >
                <option value="">Seleccionar cuenta</option>
                {cuentasPorSede.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.nombre}>
                    {cuenta.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tipo
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                <option>Ingreso</option>
                <option>Egreso</option>
              </select>
            </label>

            <label>
              Importe
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.importe}
                onChange={(e) => setForm({ ...form, importe: e.target.value })}
              />
            </label>

            <label>
              Estado
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
              >
                <option>Pendiente</option>
                <option>Conciliado</option>
                <option>Movimiento sin identificar</option>
              </select>
            </label>

            <label>
              Origen
              <input
                value={form.origen}
                onChange={(e) => setForm({ ...form, origen: e.target.value })}
              />
            </label>

            <label className="full">
              Descripción
              <input
                required
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Guardando..." : "Guardar movimiento"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "gestionarCuentas" && (
        <Modal title="Gestionar cuentas bancarias" size="wide" onClose={() => setModal(null)}>
          <div className="table-card table-card-spaced">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {cuentas.map((cuenta) => (
                  <tr key={cuenta.id}>
                    <td>
                      <strong>{cuenta.nombre}</strong>
                    </td>
                    <td>{cuenta.tipo}</td>
                    <td>{cuenta.sede}</td>
                    <td>
                      <span className={`status-badge ${cuenta.activa ? "aplicado" : "pendiente"}`}>
                        {cuenta.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button type="button" title="Editar cuenta" onClick={() => openEditarCuenta(cuenta)}>
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          title="Eliminar cuenta"
                          onClick={() => handleDeleteCuenta(cuenta)}
                          disabled={deletingId === cuenta.id}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && cuentas.length === 0 && (
                  <tr>
                    <td colSpan="5">No hay cuentas bancarias cargadas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form
            className="form-grid"
            onSubmit={cuentaEditando ? handleUpdateCuenta : handleCreateCuenta}
          >
            <div className="full split-header">
              <div>
                <strong>{cuentaEditando ? "Editar cuenta" : "Nueva cuenta"}</strong>
              </div>

              {cuentaEditando && (
                <button type="button" className="secondary-button" onClick={cancelarEdicionCuenta}>
                  Nueva cuenta
                </button>
              )}
            </div>

            <label>
              Nombre
              <input
                required
                value={cuentaForm.nombre}
                onChange={(e) =>
                  setCuentaForm({ ...cuentaForm, nombre: e.target.value })
                }
              />
            </label>

            <label>
              Tipo
              <select
                value={cuentaForm.tipo}
                onChange={(e) =>
                  setCuentaForm({ ...cuentaForm, tipo: e.target.value })
                }
              >
                <option>Banco</option>
                <option>Billetera virtual</option>
                <option>Caja</option>
              </select>
            </label>

            <label>
              Sede
              <select
                value={cuentaForm.sedeId}
                onChange={(e) =>
                  setCuentaForm({ ...cuentaForm, sedeId: e.target.value })
                }
                disabled={sedeBloqueada}
              >
                <option value="">Todas</option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Estado
              <select
                value={cuentaForm.activa ? "activa" : "inactiva"}
                onChange={(e) =>
                  setCuentaForm({ ...cuentaForm, activa: e.target.value === "activa" })
                }
              >
                <option value="activa">Activa</option>
                <option value="inactiva">Inactiva</option>
              </select>
            </label>
            {!cuentaEditando && <span />}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving
                  ? "Guardando..."
                  : cuentaEditando
                    ? "Guardar cambios"
                    : "Crear cuenta"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "revisarExtracto" && extractoPendiente && (
        <Modal
          title="Revisar e importar extracto bancario"
          size="wide"
          onClose={() => setModal(null)}
        >
          <form className="form-grid" onSubmit={confirmarExtractoImportado}>
            <label>
              Fecha de carga
              <input
                type="date"
                required
                value={extractoPendiente.fecha}
                onChange={(e) =>
                  setExtractoPendiente({
                    ...extractoPendiente,
                    fecha: e.target.value,
                  })
                }
              />
            </label>

            <label>
              Cuenta / asociado a
              <select
                required
                value={extractoPendiente.asociadoA}
                onChange={(e) => {
                  const cuentaSeleccionada = e.target.value;

                  setExtractoPendiente({
                    ...extractoPendiente,
                    asociadoA: cuentaSeleccionada,
                  });

                  setMovimientosPreview((prev) =>
                    prev.map((mov) => ({
                      ...mov,
                      cuenta: cuentaSeleccionada,
                    }))
                  );
                }}
              >
                <option value="">Seleccionar cuenta</option>
                {cuentasPorSede.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.nombre}>
                    {cuenta.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Sede por defecto
              <select
                value={extractoPendiente.sedeId}
                onChange={(e) => {
                  const nuevaSedeId = e.target.value;

                  setExtractoPendiente({
                    ...extractoPendiente,
                    sedeId: nuevaSedeId,
                  });

                  setMovimientosPreview((prev) =>
                    prev.map((mov) => ({
                      ...mov,
                      sedeId: nuevaSedeId,
                    }))
                  );
                }}
                disabled={sedeBloqueada}
              >
                <option value="">Todas las sedes</option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Estado documento
              <select
                value={extractoPendiente.estado}
                onChange={(e) =>
                  setExtractoPendiente({
                    ...extractoPendiente,
                    estado: e.target.value,
                  })
                }
              >
                <option>Pendiente revisión</option>
                <option>Validado</option>
                <option>Conciliado</option>
              </select>
            </label>

            <label className="full">
              Descripción del documento
              <input
                required
                placeholder="Ej: Extracto Galicia mayo 2026"
                value={extractoPendiente.descripcion}
                onChange={(e) =>
                  setExtractoPendiente({
                    ...extractoPendiente,
                    descripcion: e.target.value,
                  })
                }
              />
            </label>

            <div className="full import-summary">
              <div className="import-summary-header">
                <div>
                  <strong>Archivo analizado</strong>
                  <span>{extractoPendiente.archivo}</span>
                </div>

                <div className="import-summary-status">
                  <span className="status-badge aplicado">
                    {extractoParseado?.banco || "Banco no detectado"}
                  </span>
                </div>
              </div>

              <div className="import-summary-grid">
                <div className="import-summary-card">
                  <span>Tipo de documento</span>
                  <strong>{extractoParseado?.detected?.tipoDocumento || "-"}</strong>
                </div>

                <div className="import-summary-card">
                  <span>Cuenta detectada</span>
                  <strong>{extractoParseado?.cuentaDetectada || "-"}</strong>
                </div>

                <div className="import-summary-card">
                  <span>CBU detectado</span>
                  <strong>{extractoParseado?.cbuDetectado || "-"}</strong>
                </div>

                <div className="import-summary-card">
                  <span>Tamaño</span>
                  <strong>{formatFileSize(extractoPendiente.archivoSize)}</strong>
                </div>

                <div className="import-summary-card">
                  <span>Movimientos</span>
                  <strong>{movimientosPreview.length}</strong>
                </div>

                <div className="import-summary-card">
                  <span>Nuevos</span>
                  <strong>
                    {
                      movimientosPreview.filter(
                        (mov) => !mov.duplicadoSistema && !mov.duplicadoArchivo
                      ).length
                    }
                  </strong>
                </div>

                <div className="import-summary-card warning">
                  <span>Duplicados</span>
                  <strong>
                    {
                      movimientosPreview.filter(
                        (mov) => mov.duplicadoSistema || mov.duplicadoArchivo
                      ).length
                    }
                  </strong>
                </div>
              </div>

              {extractoParseado?.error && (
                <div className="import-warning">
                  <strong>Observación:</strong> {extractoParseado.error}
                </div>
              )}
            </div>

            {movimientosPreview.length > 0 && (
              <div className="full">
                <div className="import-table-toolbar">
                  <div>
                    <strong>Movimientos detectados</strong>
                    <span>
                      Revisá, corregí y confirmá solo los movimientos nuevos. Los duplicados quedan bloqueados.
                    </span>
                  </div>

                  <div className="import-table-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => seleccionarTodosPreview(true)}
                    >
                      <CheckCircle2 size={15} /> Seleccionar nuevos
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => seleccionarTodosPreview(false)}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="table-card import-preview-table-wrap">
                  <table className="import-preview-table">
                    <thead>
                      <tr>
                        <th>Importar</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                        <th>Sede</th>
                        <th>Cuenta</th>
                        <th>Tipo</th>
                        <th>Descripción</th>
                        <th>Importe</th>
                        <th>Saldo PDF</th>
                      </tr>
                    </thead>

                    <tbody>
                      {movimientosPreview.map((mov) => (
                        <tr
                          key={mov.previewId}
                          className={
                            mov.duplicadoSistema || mov.duplicadoArchivo
                              ? "import-row-duplicate"
                              : ""
                          }
                        >
                          <td className="import-check-cell">
                            <input
                              type="checkbox"
                              checked={mov.seleccionado}
                              disabled={mov.duplicadoSistema || mov.duplicadoArchivo}
                              onChange={() => toggleMovimientoPreview(mov.previewId)}
                            />
                          </td>

                          <td>
                            <span
                              className={`status-badge ${mov.duplicadoSistema || mov.duplicadoArchivo
                                ? "pendiente"
                                : "aplicado"
                                }`}
                            >
                              {mov.estadoImportacion || "Nuevo"}
                            </span>
                          </td>

                          <td>
                            <input
                              className="import-input-date"
                              type="date"
                              value={mov.fecha}
                              onChange={(e) =>
                                updateMovimientoPreview(mov.previewId, "fecha", e.target.value)
                              }
                            />
                          </td>

                          <td>
                            <select
                              className="import-select-sede"
                              value={mov.sedeId}
                              onChange={(e) =>
                                updateMovimientoPreview(mov.previewId, "sedeId", e.target.value)
                              }
                              disabled={sedeBloqueada}
                            >
                              <option value="">Todas las sedes</option>
                              {sedes.map((sede) => (
                                <option key={sede.id} value={sede.id}>
                                  {sede.nombre}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td>
                            <select
                              className="import-select-cuenta"
                              value={mov.cuenta}
                              onChange={(e) =>
                                updateMovimientoPreview(mov.previewId, "cuenta", e.target.value)
                              }
                            >
                              <option value="">Cuenta</option>
                              {cuentasPorSede.map((cuenta) => (
                                <option key={cuenta.id} value={cuenta.nombre}>
                                  {cuenta.nombre}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td>
                            <select
                              className="import-select-tipo"
                              value={mov.tipo}
                              onChange={(e) =>
                                updateMovimientoPreview(mov.previewId, "tipo", e.target.value)
                              }
                            >
                              <option>Ingreso</option>
                              <option>Egreso</option>
                            </select>
                          </td>

                          <td>
                            <input
                              className="import-input-description"
                              value={mov.descripcion}
                              onChange={(e) =>
                                updateMovimientoPreview(mov.previewId, "descripcion", e.target.value)
                              }
                            />
                          </td>

                          <td>
                            <input
                              className="import-input-money"
                              type="number"
                              min="0"
                              step="0.01"
                              value={mov.importe}
                              onChange={(e) =>
                                updateMovimientoPreview(mov.previewId, "importe", e.target.value)
                              }
                            />
                          </td>

                          <td className="import-money-cell">{formatMoney(mov.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {movimientosPreview.length === 0 && (
              <div className="full document-preview">
                <Eye size={16} /> No se detectaron movimientos importables en este PDF.
                El archivo se puede guardar como documento, pero no generará movimientos bancarios.
              </div>
            )}

            <div className="modal-actions import-footer-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setExtractoPendiente(null);
                  setExtractoParseado(null);
                  setMovimientosPreview([]);
                  setModal(null);
                }}
              >
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving
                  ? "Importando..."
                  : movimientosPreview.length > 0
                    ? "Guardar PDF e importar movimientos"
                    : "Guardar solo PDF"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "conciliar" && movimientoAConciliar && (
        <Modal title="Conciliar movimiento" onClose={() => setModal(null)}>
          <div className="detail-grid">
            <div>
              <span>Movimiento</span>
              <strong>{movimientoAConciliar.descripcion}</strong>
            </div>

            <div>
              <span>Importe</span>
              <strong>{formatMoney(movimientoAConciliar.importe)}</strong>
            </div>

            <div>
              <span>Cuenta</span>
              <strong>{movimientoAConciliar.cuenta}</strong>
            </div>

            <div>
              <span>Tipo</span>
              <strong>{movimientoAConciliar.tipo}</strong>
            </div>
          </div>

          <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
            <label className="full">
              Comprobante a vincular
              <select
                value={comprobanteSeleccionadoId}
                onChange={(e) => setComprobanteSeleccionadoId(e.target.value)}
              >
                {candidatosConciliacion.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatDate(getFechaReal(item))} ·{" "}
                    {item.concepto ||
                      item.proveedor ||
                      item.sociedad ||
                      item.descripcion}{" "}
                    · {formatMoney(item.importe)}
                    {item.sugerido ? " · sugerido" : ""}
                  </option>
                ))}
              </select>
            </label>

            {candidatosConciliacion.length === 0 && (
              <div className="full document-preview">
                No hay comprobantes disponibles para conciliar con este movimiento.
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-button"
                disabled={saving || !comprobanteSeleccionadoId}
                onClick={handleConfirmarConciliacion}
              >
                {saving ? "Conciliando..." : "Confirmar conciliación"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
