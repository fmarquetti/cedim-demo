import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Upload,
  ExternalLink,
  CheckCircle,
  RefreshCw,
  FileText,
  FileSpreadsheet,
} from "lucide-react";

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import jsQR from "jsqr";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Modal from "../components/Modal";
import {
  createIngreso,
  deleteIngreso,
  getIngresos,
  marcarIngresoCobrado,
} from "../services/ingresoService";
import { getSedes } from "../services/sedeService";
import {
  getEntidadesCuentaCorriente,
  normalizeDocument,
  normalizeText,
} from "../services/cuentaCorrienteEntidadService";

import { formatMoney, formatDate, toDate } from "../utils/format";
import { toast } from "../components/ToastProvider";
import { canPerform } from "../utils/permissions";
import { getDbSedeId } from "../utils/sedeUtils";
import { loadSafeBatch, notifyLoadErrors } from "../utils/loadSafe";

import ConceptoSelector from "../components/ConceptoSelector";
import EntityAutocomplete from "../components/EntityAutocomplete";
import { getConceptoItems } from "../services/conceptoItemService";
import { leerQRDesdePDF as leerQrFiscalDesdePdf, extraerDatosQRFiscal as extraerDatosQrFiscalUtil, tipoComprobanteLabel as tipoComprobanteLabelUtil } from "../utils/qrFiscal";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const emptyForm = {
  fecha: new Date().toISOString().split("T")[0],
  concepto: "",
  conceptosItems: [],
  sociedad: "",
  sedeId: "",
  origen: "Obra Social",
  importe: "",
  fechaVencimiento: "",
  cobro: "Transferencia",
  estado: "Pendiente",
  distribuciones: [],
};

const getFechaReal = (item) => item?.fechaDb || item?.fecha;

const safeFileName = (text) =>
  String(text || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_");

function decodeBase64Url(base64Url) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const jsonString = decodeURIComponent(escape(atob(padded)));
  return JSON.parse(jsonString);
}

function extraerDatosQRFiscal(qrText) {
  const url = new URL(qrText);
  const p = url.searchParams.get("p");
  if (!p) throw new Error("El QR no contiene datos fiscales válidos.");
  return decodeBase64Url(p);
}

function tipoComprobanteLabel(codigo) {
  const tipos = {
    1: "Factura A", 2: "Nota de Débito A", 3: "Nota de Crédito A",
    6: "Factura B", 7: "Nota de Débito B", 8: "Nota de Crédito B",
    11: "Factura C", 12: "Nota de Débito C", 13: "Nota de Crédito C",
    51: "Factura M",
  };
  return tipos[codigo] || `Comprobante ${codigo}`;
}

function formatFechaInput(fecha) {
  if (!fecha) return "";
  if (fecha.includes("-")) return fecha;
  const [dd, mm, yyyy] = fecha.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Ingresos({ selectedSede, sedeId, dbSedeId, currentUser }) {
  const facturaInputRef = useRef(null);
  const canCreateIngresos = canPerform(currentUser, "ingresos", "create");
  const canEditIngresos = canPerform(currentUser, "ingresos", "edit");
  const canDeleteIngresos = canPerform(currentUser, "ingresos", "delete");

  const [ingresos, setIngresos] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [clientes, setClientes] = useState([]);

  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [origenFiltro, setOrigenFiltro] = useState("Todos");
  const [cobroFiltro, setCobroFiltro] = useState("Todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [modal, setModal] = useState(null);
  const [importandoFactura, setImportandoFactura] = useState(false);
  const [ingresoPendiente, setIngresoPendiente] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [conceptoItems, setConceptoItems] = useState([]);
  const idSedeActiva = dbSedeId ?? getDbSedeId(sedeId);
  const sedeBloqueada = Boolean(idSedeActiva);

  async function loadData(currentSedeId = idSedeActiva) {
    setLoading(true);
    const idParaFiltro = getDbSedeId(currentSedeId);
    const results = await loadSafeBatch({
      ingresos: {
        label: "ingresos",
        promise: getIngresos(idParaFiltro),
        fallback: [],
      },
      sedes: {
        label: "sedes para ingresos",
        promise: getSedes(),
        fallback: [],
      },
      clientes: {
        label: "clientes para ingresos",
        promise: getEntidadesCuentaCorriente({ tipo: "cliente", activa: true }),
        fallback: [],
      },
      conceptos: {
        label: "conceptos de ingresos",
        promise: getConceptoItems("ingreso"),
        fallback: [],
      },
    });

    setIngresos(results.ingresos.data || []);
    setSedes(results.sedes.data || []);
    setClientes(results.clientes.data || []);
    setConceptoItems(results.conceptos.data || []);
    setForm((prev) => ({
      ...prev,
      sedeId: prev.sedeId || idParaFiltro || results.sedes.data?.[0]?.id || "",
    }));
    notifyLoadErrors(results, toast.error);
    setLoading(false);
  }
  useEffect(() => {
    queueMicrotask(() => loadData(idSedeActiva));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSedeActiva]);

  const origenes = useMemo(() => {
    return [...new Set(ingresos.map((item) => item.origen).filter(Boolean))].sort();
  }, [ingresos]);

  const formasCobro = useMemo(() => {
    return [...new Set(ingresos.map((item) => item.cobro).filter(Boolean))].sort();
  }, [ingresos]);

  const ingresosFiltrados = useMemo(() => {
    const searchValue = search.toLowerCase().trim();
    const fechaDesde = toDate(desde);
    const fechaHasta = toDate(hasta);

    return ingresos.filter((item) => {
      const fechaItem = toDate(getFechaReal(item));
      const matchSearch =
        !searchValue ||
        item.concepto?.toLowerCase().includes(searchValue) ||
        item.sociedad?.toLowerCase().includes(searchValue) ||
        item.origen?.toLowerCase().includes(searchValue) ||
        item.sede?.toLowerCase().includes(searchValue) ||
        item.comprobante?.toLowerCase().includes(searchValue);

      const matchEstado = estadoFiltro === "Todos" || item.estado === estadoFiltro;
      const matchOrigen = origenFiltro === "Todos" || item.origen === origenFiltro;
      const matchCobro = cobroFiltro === "Todos" || item.cobro === cobroFiltro;
      const matchDesde = !fechaDesde || (fechaItem && fechaItem >= fechaDesde);
      const matchHasta = !fechaHasta || (fechaItem && fechaItem <= fechaHasta);

      return matchSearch && matchEstado && matchOrigen && matchCobro && matchDesde && matchHasta;
    });
  }, [ingresos, search, estadoFiltro, origenFiltro, cobroFiltro, desde, hasta]);

  const totalGeneral = ingresosFiltrados.reduce((acc, item) => acc + Number(item.importe || 0), 0);
  const totalCobrado = ingresosFiltrados.filter((i) => i.estado === "Cobrado").reduce((acc, i) => acc + Number(i.importe || 0), 0);
  const totalPendiente = ingresosFiltrados.filter((i) => i.estado === "Pendiente").reduce((acc, i) => acc + Number(i.importe || 0), 0);
  const ingresosFiscales = ingresosFiltrados.filter((item) => item.datosFiscales?.qrUrl);

  function findCliente(value) {
    const term = normalizeText(value);
    const documento = normalizeDocument(value);
    if (!term && !documento) return null;

    return clientes.find((cliente) => {
      const nombre = normalizeText(cliente.nombre);
      const doc = normalizeDocument(cliente.documento);
      return (
        nombre === term ||
        nombre.startsWith(term) ||
        (documento && doc === documento) ||
        (documento && doc.startsWith(documento))
      );
    });
  }

  function applyClienteToForm(current, cliente) {
    if (!cliente) return current;

    return {
      ...current,
      sociedad: cliente.nombre,
      facturaCuit: cliente.documento || current.facturaCuit || "",
    };
  }

  function getEntidadPagadoraDesdeFactura(datos) {
    const documentoReceptor = normalizeDocument(
      datos?.nroDocRec ||
        datos?.numeroDocumentoReceptor ||
        datos?.documentoReceptor ||
        ""
    );

    if (!documentoReceptor) return "";

    const cliente = findCliente(documentoReceptor);

    return cliente?.nombre || `CUIT ${documentoReceptor}`;
  }

  function updateClienteManual(value) {
    setForm((prev) =>
      applyClienteToForm({ ...prev, sociedad: value }, findCliente(value))
    );
  }

  function updateClienteImportado(value) {
    setIngresoPendiente((prev) => {
      if (!prev) return prev;

      return applyClienteToForm(
        { ...prev, sociedad: value },
        findCliente(value),
      );
    });
  }

  function openNuevoIngreso() {
    if (!canCreateIngresos) return;

    setForm({
      ...emptyForm,
      sedeId: idSedeActiva || sedes[0]?.id || "",
    });
    setModal("nuevo");
  }

  const resumenPorOrigen = useMemo(() => {
    const map = {};
    ingresosFiltrados.forEach((item) => {
      const key = item.origen || "Sin origen";
      if (!map[key]) map[key] = { origen: key, cantidad: 0, total: 0, cobrado: 0, pendiente: 0 };
      map[key].cantidad += 1;
      map[key].total += Number(item.importe || 0);
      if (item.estado === "Cobrado") map[key].cobrado += Number(item.importe || 0);
      if (item.estado === "Pendiente") map[key].pendiente += Number(item.importe || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [ingresosFiltrados]);

  const nombreArchivo = useMemo(() => {
    const sede = selectedSede?.nombre || "Todas las sedes";
    const periodo = desde || hasta
      ? `${desde || "inicio"}_${hasta || "actual"}`
      : "todos_los_periodos";
    return `Ingresos_${safeFileName(sede)}_${safeFileName(periodo)}`;
  }, [selectedSede, desde, hasta]);

  function aplicarFiltroRapido(tipo) {
    const hoy = new Date();
    const isoHoy = hoy.toISOString().split("T")[0];
    if (tipo === "hoy") { setDesde(isoHoy); setHasta(isoHoy); }
    if (tipo === "mes") {
      setDesde(new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0]);
      setHasta(isoHoy);
    }
    if (tipo === "pendientes") setEstadoFiltro("Pendiente");
    if (tipo === "limpiar") {
      setSearch(""); setEstadoFiltro("Todos"); setOrigenFiltro("Todos");
      setCobroFiltro("Todos"); setDesde(""); setHasta("");
    }
  }

  function redondearPorcentaje(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function totalDistribucion(distribuciones = form.distribuciones) {
    return redondearPorcentaje(
      distribuciones.reduce((acc, item) => acc + Number(item.porcentaje || 0), 0)
    );
  }

  function getSedesSeleccionadas(distribuciones = form.distribuciones) {
    return (distribuciones || [])
      .map((item) => item.sedeId)
      .filter(Boolean);
  }

  function getSedesDisponibles(indexActual, distribuciones = form.distribuciones) {
    const sedeActual = distribuciones?.[indexActual]?.sedeId;

    const sedesUsadas = new Set(
      (distribuciones || [])
        .map((item, index) => (index === indexActual ? null : item.sedeId))
        .filter(Boolean)
    );

    return sedes.filter((sede) => !sedesUsadas.has(sede.id) || sede.id === sedeActual);
  }

  function agregarDistribucion() {
    setForm((prev) => {
      const distribucionesActuales = prev.distribuciones || [];
      const sedesSeleccionadas = getSedesSeleccionadas(distribucionesActuales);

      const primeraSedeLibre = sedes.find((sede) => !sedesSeleccionadas.includes(sede.id));

      if (!primeraSedeLibre) {
        toast.error("Ya seleccionaste todas las sedes disponibles.");
        return prev;
      }

      const nuevasDistribuciones = [
        ...distribucionesActuales,
        {
          sedeId: primeraSedeLibre.id,
          porcentaje: 0,
        },
      ];

      const porcentajeBase = redondearPorcentaje(100 / nuevasDistribuciones.length);
      let acumulado = 0;

      const distribucionesNormalizadas = nuevasDistribuciones.map((item, index) => {
        const esUltimo = index === nuevasDistribuciones.length - 1;

        const porcentaje = esUltimo
          ? redondearPorcentaje(100 - acumulado)
          : porcentajeBase;

        acumulado = redondearPorcentaje(acumulado + porcentaje);

        return {
          ...item,
          porcentaje,
        };
      });

      return {
        ...prev,
        distribuciones: distribucionesNormalizadas,
      };
    });
  }

  function actualizarDistribucion(index, field, value) {
    setForm((prev) => {
      const distribuciones = [...(prev.distribuciones || [])];

      if (field === "sedeId") {
        const sedeYaUsada = distribuciones.some(
          (item, itemIndex) => itemIndex !== index && item.sedeId === value
        );

        if (sedeYaUsada) {
          toast.error("Esa sede ya fue seleccionada en la distribución.");
          return prev;
        }

        distribuciones[index] = {
          ...distribuciones[index],
          sedeId: value,
        };

        return {
          ...prev,
          distribuciones,
        };
      }

      if (field === "porcentaje") {
        let nuevoPorcentaje = redondearPorcentaje(value);

        if (nuevoPorcentaje < 0) nuevoPorcentaje = 0;
        if (nuevoPorcentaje > 100) nuevoPorcentaje = 100;

        const otrasLineas = distribuciones.filter((_, itemIndex) => itemIndex !== index);
        const cantidadOtras = otrasLineas.length;

        if (cantidadOtras === 0) {
          distribuciones[index] = {
            ...distribuciones[index],
            porcentaje: Math.min(nuevoPorcentaje, 100),
          };

          return {
            ...prev,
            distribuciones,
          };
        }

        const restante = redondearPorcentaje(100 - nuevoPorcentaje);

        distribuciones[index] = {
          ...distribuciones[index],
          porcentaje: nuevoPorcentaje,
        };

        if (cantidadOtras === 1) {
          const otroIndex = distribuciones.findIndex((_, itemIndex) => itemIndex !== index);

          distribuciones[otroIndex] = {
            ...distribuciones[otroIndex],
            porcentaje: restante,
          };
        } else {
          const porcentajePorLinea = redondearPorcentaje(restante / cantidadOtras);
          let acumulado = 0;

          distribuciones.forEach((item, itemIndex) => {
            if (itemIndex === index) return;

            const esUltimaOtra =
              distribuciones
                .map((_, mapIndex) => mapIndex)
                .filter((mapIndex) => mapIndex !== index)
                .at(-1) === itemIndex;

            const porcentajeFinal = esUltimaOtra
              ? redondearPorcentaje(restante - acumulado)
              : porcentajePorLinea;

            acumulado = redondearPorcentaje(acumulado + porcentajeFinal);

            distribuciones[itemIndex] = {
              ...item,
              porcentaje: porcentajeFinal,
            };
          });
        }

        return {
          ...prev,
          distribuciones,
        };
      }

      distribuciones[index] = {
        ...distribuciones[index],
        [field]: value,
      };

      return {
        ...prev,
        distribuciones,
      };
    });
  }

  function eliminarDistribucion(index) {
    setForm((prev) => {
      const distribuciones = (prev.distribuciones || []).filter((_, i) => i !== index);

      if (distribuciones.length === 1) {
        distribuciones[0] = {
          ...distribuciones[0],
          porcentaje: 100,
        };
      }

      return {
        ...prev,
        distribuciones,
      };
    });
  }

  function calcularImporteDistribuido(porcentaje) {
    const importe = Number(form.importe || 0);
    return (importe * Number(porcentaje || 0)) / 100;
  }

  /* eslint-disable no-unused-vars */
  function totalDistribucionIngresoPendiente() {
    return totalDistribucion(ingresoPendiente?.distribuciones || []);
  }

  function getSedesDisponiblesIngresoPendiente(indexActual) {
    return getSedesDisponibles(indexActual, ingresoPendiente?.distribuciones || []);
  }

  function agregarDistribucionIngresoPendiente() {
    setIngresoPendiente((prev) => {
      if (!prev) return prev;

      const distribucionesActuales = prev.distribuciones || [];
      const sedesSeleccionadas = getSedesSeleccionadas(distribucionesActuales);

      const primeraSedeLibre = sedes.find((sede) => !sedesSeleccionadas.includes(sede.id));

      if (!primeraSedeLibre) {
        toast.error("Ya seleccionaste todas las sedes disponibles.");
        return prev;
      }

      const nuevasDistribuciones = [
        ...distribucionesActuales,
        {
          sedeId: primeraSedeLibre.id,
          porcentaje: 0,
        },
      ];

      const porcentajeBase = redondearPorcentaje(100 / nuevasDistribuciones.length);
      let acumulado = 0;

      const distribucionesNormalizadas = nuevasDistribuciones.map((item, index) => {
        const esUltimo = index === nuevasDistribuciones.length - 1;

        const porcentaje = esUltimo
          ? redondearPorcentaje(100 - acumulado)
          : porcentajeBase;

        acumulado = redondearPorcentaje(acumulado + porcentaje);

        return {
          ...item,
          porcentaje,
        };
      });

      return {
        ...prev,
        distribuciones: distribucionesNormalizadas,
      };
    });
  }

  function actualizarDistribucionIngresoPendiente(index, field, value) {
    setIngresoPendiente((prev) => {
      const distribuciones = [...(prev.distribuciones || [])];

      if (field === "sedeId") {
        const sedeYaUsada = distribuciones.some(
          (item, itemIndex) => itemIndex !== index && item.sedeId === value
        );

        if (sedeYaUsada) {
          toast.error("Esa sede ya fue seleccionada en la distribución.");
          return prev;
        }

        distribuciones[index] = {
          ...distribuciones[index],
          sedeId: value,
        };

        return {
          ...prev,
          distribuciones,
        };
      }

      if (field === "porcentaje") {
        let nuevoPorcentaje = redondearPorcentaje(value);

        if (nuevoPorcentaje < 0) nuevoPorcentaje = 0;
        if (nuevoPorcentaje > 100) nuevoPorcentaje = 100;

        const otrasLineas = distribuciones.filter((_, itemIndex) => itemIndex !== index);
        const cantidadOtras = otrasLineas.length;

        if (cantidadOtras === 0) {
          distribuciones[index] = {
            ...distribuciones[index],
            porcentaje: Math.min(nuevoPorcentaje, 100),
          };

          return {
            ...prev,
            distribuciones,
          };
        }

        const restante = redondearPorcentaje(100 - nuevoPorcentaje);

        distribuciones[index] = {
          ...distribuciones[index],
          porcentaje: nuevoPorcentaje,
        };

        if (cantidadOtras === 1) {
          const otroIndex = distribuciones.findIndex((_, itemIndex) => itemIndex !== index);

          distribuciones[otroIndex] = {
            ...distribuciones[otroIndex],
            porcentaje: restante,
          };
        } else {
          const porcentajePorLinea = redondearPorcentaje(restante / cantidadOtras);
          let acumulado = 0;

          distribuciones.forEach((item, itemIndex) => {
            if (itemIndex === index) return;

            const esUltimaOtra =
              distribuciones
                .map((_, mapIndex) => mapIndex)
                .filter((mapIndex) => mapIndex !== index)
                .at(-1) === itemIndex;

            const porcentajeFinal = esUltimaOtra
              ? redondearPorcentaje(restante - acumulado)
              : porcentajePorLinea;

            acumulado = redondearPorcentaje(acumulado + porcentajeFinal);

            distribuciones[itemIndex] = {
              ...item,
              porcentaje: porcentajeFinal,
            };
          });
        }

        return {
          ...prev,
          distribuciones,
        };
      }

      distribuciones[index] = {
        ...distribuciones[index],
        [field]: value,
      };

      return {
        ...prev,
        distribuciones,
      };
    });
  }

  function eliminarDistribucionIngresoPendiente(index) {
    setIngresoPendiente((prev) => {
      const distribuciones = (prev.distribuciones || []).filter((_, i) => i !== index);

      if (distribuciones.length === 1) {
        distribuciones[0] = {
          ...distribuciones[0],
          porcentaje: 100,
        };
      }

      return {
        ...prev,
        distribuciones,
      };
    });
  }

  function calcularImporteDistribuidoIngresoPendiente(porcentaje) {
    const importe = Number(ingresoPendiente?.importe || 0);
    return (importe * Number(porcentaje || 0)) / 100;
  }
  /* eslint-enable no-unused-vars */

  async function handleCreate(e) {
    e.preventDefault();
    if (!canCreateIngresos) return;

    if (form.distribuciones?.length) {
      const total = totalDistribucion();

      if (Math.abs(total - 100) > 0.01) {
        toast.error("La distribución entre sedes debe sumar exactamente 100%.");
        return;
      }

      const sedesSeleccionadas = form.distribuciones.map((item) => item.sedeId);
      const sedesUnicas = new Set(sedesSeleccionadas);

      if (sedesSeleccionadas.some((id) => !id)) {
        toast.error("Todas las líneas de distribución deben tener una sede.");
        return;
      }

      if (sedesUnicas.size !== sedesSeleccionadas.length) {
        toast.error("No podés repetir la misma sede en la distribución.");
        return;
      }
    }

    if (!form.conceptosItems?.length && !form.concepto?.trim()) {
      toast.error("Seleccioná al menos un concepto o cargá uno manual.");
      return;
    }

    setSaving(true);
    try {
      await createIngreso(form);
      await loadData();
      setForm({ ...emptyForm, sedeId: idSedeActiva || sedes[0]?.id || "" });
      setModal(null);
      toast.success("Ingreso guardado correctamente.");
    } catch (error) {
      toast.error(error.message || "No se pudo crear el ingreso.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!canDeleteIngresos) return;

    if (!window.confirm("¿Eliminar este ingreso?")) return;
    setDeletingId(id);
    try {
      await deleteIngreso(id);
      await loadData();
      toast.success("Ingreso eliminado.");
    } catch (error) {
      toast.error(error.message || "No se pudo eliminar el ingreso.");
    } finally {
      setDeletingId(null);
    }
  }

  async function marcarCobrado(id) {
    if (!canEditIngresos) return;

    try {
      await marcarIngresoCobrado(id);
      await loadData();
      toast.success("Ingreso marcado como cobrado.");
    } catch (error) {
      toast.error(error.message || "No se pudo marcar como cobrado.");
    }
  }

  async function leerQRDesdePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imageData.data, canvas.width, canvas.height);
      if (qr?.data) return qr.data;
    }
    throw new Error("No se encontró ningún código QR en el PDF.");
  }

  async function importarFacturaFiscal(e) {
    if (!canCreateIngresos) return;

    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportandoFactura(true);
      const qrText = await leerQrFiscalDesdePdf(file);
      const datos = extraerDatosQrFiscalUtil(qrText);
      const tipoComprobante = tipoComprobanteLabelUtil(datos.tipoCmp);
      const puntoVenta = String(datos.ptoVta || "").padStart(4, "0");
      const numeroComprobante = String(datos.nroCmp || "").padStart(8, "0");

      const sedeDefault = idSedeActiva
        ? sedes.find((s) => s.id === idSedeActiva)
        : sedes[0];

      setIngresoPendiente({
        fecha: formatFechaInput(datos.fecha),
        concepto: "",
        conceptosItems: [],
        sociedad: getEntidadPagadoraDesdeFactura(datos),
        sedeId: sedeDefault?.id || "",
        origen: "Factura fiscal",
        importe: Number(datos.importe || 0),
        fechaVencimiento: "",
        cobro: "Transferencia",
        estado: "Pendiente",
        archivo: file.name,
        comprobante: `${tipoComprobante} ${puntoVenta}-${numeroComprobante}`,
        datosFiscales: { ...datos, qrUrl: qrText, tipoComprobante, puntoVenta, numeroComprobante },
        distribuciones: [],
      });
      setModal("revisarFactura");
    } catch (error) {
      toast.error(error.message || "No se pudo importar la factura.");
    } finally {
      setImportandoFactura(false);
      e.target.value = "";
    }
  }

  async function confirmarIngresoImportado(e) {
    e.preventDefault();
    if (!canCreateIngresos) return;
    if (!ingresoPendiente.conceptosItems?.length && !ingresoPendiente.concepto?.trim()) {
      toast.error("Seleccioná al menos un concepto o cargá uno manual.");
      return;
    }

    if (ingresoPendiente.distribuciones?.length) {
      const total = totalDistribucion(ingresoPendiente.distribuciones);

      if (Math.abs(total - 100) > 0.01) {
        toast.error("La distribución entre sedes debe sumar exactamente 100%.");
        return;
      }

      const sedesSeleccionadas = ingresoPendiente.distribuciones.map((item) => item.sedeId);
      const sedesUnicas = new Set(sedesSeleccionadas);

      if (sedesSeleccionadas.some((id) => !id)) {
        toast.error("Todas las líneas de distribución deben tener una sede.");
        return;
      }

      if (sedesUnicas.size !== sedesSeleccionadas.length) {
        toast.error("No podés repetir la misma sede en la distribución.");
        return;
      }
    }

    setSaving(true);

    try {
      await createIngreso(ingresoPendiente);
      await loadData();
      setIngresoPendiente(null);
      setModal(null);
      toast.success("Factura importada y guardada correctamente.");
    } catch (error) {
      toast.error(error.message || "No se pudo guardar el ingreso importado.");
    } finally {
      setSaving(false);
    }
  }

  function verAfip(qrUrl) {
    if (!qrUrl) { toast.error("Este comprobante no tiene URL fiscal disponible."); return; }
    window.open(qrUrl, "_blank", "noopener,noreferrer");
  }

  const exportarExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "CEDIM - TECNEW";
      workbook.created = new Date();
      const sedeName = selectedSede?.nombre || "Todas las sedes";

      const resumenSheet = workbook.addWorksheet("Resumen");
      resumenSheet.columns = [
        { header: "Indicador", key: "indicador", width: 32 },
        { header: "Valor", key: "valor", width: 22 },
      ];
      resumenSheet.addRows([
        { indicador: "Sede", valor: sedeName },
        { indicador: "Desde", valor: desde ? formatDate(desde) : "Inicio" },
        { indicador: "Hasta", valor: hasta ? formatDate(hasta) : "Actual" },
        { indicador: "Total ingresos", valor: totalGeneral },
        { indicador: "Total cobrado", valor: totalCobrado },
        { indicador: "Total pendiente", valor: totalPendiente },
        { indicador: "Comprobantes fiscales", valor: ingresosFiscales.length },
        { indicador: "Registros filtrados", valor: ingresosFiltrados.length },
      ]);

      const origenSheet = workbook.addWorksheet("Resumen por origen");
      origenSheet.columns = [
        { header: "Origen", key: "origen", width: 24 },
        { header: "Cantidad", key: "cantidad", width: 12 },
        { header: "Total", key: "total", width: 18 },
        { header: "Cobrado", key: "cobrado", width: 18 },
        { header: "Pendiente", key: "pendiente", width: 18 },
      ];
      origenSheet.addRows(resumenPorOrigen);

      const ingresosSheet = workbook.addWorksheet("Ingresos");
      ingresosSheet.columns = [
        { header: "Fecha", key: "fecha", width: 14 },
        { header: "Concepto", key: "concepto", width: 42 },
        { header: "Entidad pagadora", key: "sociedad", width: 28 },
        { header: "Sede", key: "sede", width: 24 },
        { header: "Origen", key: "origen", width: 20 },
        { header: "Importe", key: "importe", width: 18 },
        { header: "Cobro", key: "cobro", width: 18 },
        { header: "Estado", key: "estado", width: 16 },
        { header: "Comprobante", key: "comprobante", width: 26 },
        { header: "Archivo", key: "archivo", width: 24 },
      ];
      ingresosSheet.addRows(
        ingresosFiltrados.map((item) => ({
          fecha: formatDate(getFechaReal(item)),
          concepto: item.concepto,
          sociedad: item.sociedad,
          sede: item.sede,
          origen: item.origen,
          importe: item.importe,
          cobro: item.cobro,
          estado: item.estado,
          comprobante: item.comprobante || "",
          archivo: item.archivo || "",
        }))
      );

      workbook.worksheets.forEach((sheet) => {
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin", color: { argb: "FFE5E7EB" } },
              left: { style: "thin", color: { argb: "FFE5E7EB" } },
              bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
              right: { style: "thin", color: { argb: "FFE5E7EB" } },
            };
          });
        });
      });

      [resumenSheet.getColumn("valor"), origenSheet.getColumn("total"), origenSheet.getColumn("cobrado"), origenSheet.getColumn("pendiente"), ingresosSheet.getColumn("importe")].forEach((column) => {
        column.numFmt = '"$"#,##0.00';
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${nombreArchivo}.xlsx`);
      toast.success("Excel exportado correctamente.");
    } catch {
      toast.error("No se pudo exportar a Excel.");
    }
  };

  const exportarPDF = () => {
    try {
      const doc = new jsPDF("landscape", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const sedeName = selectedSede?.nombre || "Todas las sedes";

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("CEDIM", 14, 16);
      doc.setFontSize(15);
      doc.text("Reporte de ingresos", 14, 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Reporte generado por plataforma de gestión CEDIM", 14, 32);
      doc.setDrawColor(210);
      doc.line(14, 37, pageWidth - 14, 37);
      doc.text(`Sede: ${sedeName}`, 14, 44);
      doc.text(`Estado: ${estadoFiltro}`, 14, 49);
      doc.text(`Origen: ${origenFiltro}`, 14, 54);
      doc.text(`Cobro: ${cobroFiltro}`, 14, 59);
      doc.text(`Periodo: ${desde ? formatDate(desde) : "Inicio"} al ${hasta ? formatDate(hasta) : "Actual"}`, 14, 64);
      doc.setFont("helvetica", "bold");
      doc.text(`Total: ${formatMoney(totalGeneral)}`, 155, 44);
      doc.text(`Cobrado: ${formatMoney(totalCobrado)}`, 155, 49);
      doc.text(`Pendiente: ${formatMoney(totalPendiente)}`, 155, 54);
      doc.text(`Comprobantes fiscales: ${ingresosFiscales.length}`, 155, 59);

      autoTable(doc, {
        startY: 72,
        head: [["Origen", "Cantidad", "Total", "Cobrado", "Pendiente"]],
        body: resumenPorOrigen.map((item) => [item.origen, item.cantidad, formatMoney(item.total), formatMoney(item.cobrado), formatMoney(item.pendiente)]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [["Fecha", "Concepto", "Entidad pagadora", "Sede", "Origen", "Importe", "Cobro", "Estado"]],
        body: ingresosFiltrados.map((item) => [formatDate(getFechaReal(item)), item.concepto, item.sociedad, item.sede, item.origen, formatMoney(item.importe), item.cobro, item.estado]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        columnStyles: { 5: { halign: "right" } },
      });

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
      toast.success("PDF exportado correctamente.");
    } catch {
      toast.error("No se pudo exportar a PDF.");
    }
  };

  return (
    <section className="page">
      <div className="page-header" data-tour="ingresos-header">
        <div>
          <h2>Ingresos</h2>
          <p>Registro de cobros, obras sociales, prepagas y pagos particulares.</p>
        </div>
        <div className="header-actions">
          <input ref={facturaInputRef} type="file" accept="application/pdf" hidden onChange={importarFacturaFiscal} />
          <button
            className="secondary-button"
            onClick={loadData}
            disabled={loading}
            data-tour="ingresos-actualizar"
          >
            <RefreshCw size={16} /> Actualizar
          </button>
          {canCreateIngresos && (
            <button
              className="secondary-button"
              onClick={() => facturaInputRef.current?.click()}
              disabled={importandoFactura}
              data-tour="ingresos-importar-factura"
            >
              <Upload size={16} />{importandoFactura ? "Leyendo factura..." : "Importar factura PDF"}
            </button>
          )}
          {canCreateIngresos && (
            <button
              className="primary-button"
              onClick={openNuevoIngreso}
              data-tour="ingresos-nuevo"
            >
              <Plus size={16} /> Nuevo ingreso
            </button>
          )}
        </div>
      </div>


      <div className="stats-grid small" data-tour="ingresos-resumen">
        <div className="stat-card" data-tour="ingresos-resumen-total"><div>
          <span>Total ingresos</span>
          <strong>{formatMoney(totalGeneral)}</strong>
          <small>{ingresosFiltrados.length} registros filtrados</small>
        </div></div>
        <div className="stat-card" data-tour="ingresos-resumen-cobrado"><div>
          <span>Total cobrado</span>
          <strong>{formatMoney(totalCobrado)}</strong>
          <small>Ingresos confirmados</small>
        </div></div>
        <div className="stat-card" data-tour="ingresos-resumen-pendiente"><div>
          <span>Pendiente de cobro</span>
          <strong>{formatMoney(totalPendiente)}</strong>
          <small>Ingresos aún no acreditados</small>
        </div></div>
        <div className="stat-card" data-tour="ingresos-resumen-facturas"><div>
          <span>Facturas fiscales</span>
          <strong>{ingresosFiscales.length}</strong>
          <small>Con QR AFIP disponible</small>
        </div></div>
      </div>

      <div className="filters-bar ingresos-filters" data-tour="ingresos-filtros">
        <input placeholder="Buscar por concepto, entidad pagadora, sede, origen o comprobante..." value={search} onChange={(e) => setSearch(e.target.value)} data-tour="ingresos-busqueda" />
        <label className="filter-field"><span>Estado</span>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} data-tour="ingresos-filtro-estado">
            <option>Todos</option><option>Cobrado</option><option>Pendiente</option>
          </select>
        </label>
        <label className="filter-field"><span>Origen</span>
          <select value={origenFiltro} onChange={(e) => setOrigenFiltro(e.target.value)} data-tour="ingresos-filtro-origen">
            <option>Todos</option>
            {origenes.map((origen) => <option key={origen} value={origen}>{origen}</option>)}
          </select>
        </label>
        <label className="filter-field"><span>Cobro</span>
          <select value={cobroFiltro} onChange={(e) => setCobroFiltro(e.target.value)} data-tour="ingresos-filtro-cobro">
            <option>Todos</option>
            {formasCobro.map((forma) => <option key={forma} value={forma}>{forma}</option>)}
          </select>
        </label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} data-tour="ingresos-filtro-desde" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} data-tour="ingresos-filtro-hasta" />
        <button className="secondary-button" onClick={() => aplicarFiltroRapido("hoy")} data-tour="ingresos-filtro-hoy">Hoy</button>
        <button className="secondary-button" onClick={() => aplicarFiltroRapido("mes")} data-tour="ingresos-filtro-mes">Este mes</button>
        <button className="secondary-button" onClick={() => aplicarFiltroRapido("pendientes")} data-tour="ingresos-filtro-pendientes">Pendientes</button>
        <button className="secondary-button" onClick={() => aplicarFiltroRapido("limpiar")} data-tour="ingresos-filtro-limpiar">Limpiar</button>
        <button className="secondary-button" onClick={exportarExcel} disabled={loading} data-tour="ingresos-exportar-excel"><FileSpreadsheet size={15} /> Excel</button>
        <button className="primary-button" onClick={exportarPDF} disabled={loading} data-tour="ingresos-exportar-pdf"><FileText size={15} /> PDF</button>
      </div>

      <div className="panel" data-tour="ingresos-resumen-origen">
        <h3>Resumen por origen</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr><th>Origen</th><th>Cantidad</th><th>Total</th><th>Cobrado</th><th>Pendiente</th></tr>
            </thead>
            <tbody>
              {resumenPorOrigen.map((item) => (
                <tr key={item.origen}>
                  <td><strong>{item.origen}</strong></td>
                  <td>{item.cantidad}</td>
                  <td>{formatMoney(item.total)}</td>
                  <td>{formatMoney(item.cobrado)}</td>
                  <td>{formatMoney(item.pendiente)}</td>
                </tr>
              ))}
              {!loading && resumenPorOrigen.length === 0 && (
                <tr><td colSpan="5">No hay información para los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" data-tour="ingresos-tabla">
        <h3>Detalle de ingresos</h3>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Concepto</th><th>Entidad pagadora</th><th>Sede</th>
                <th>Origen</th><th>Importe</th><th>Cobro</th><th>Estado</th>
                <th>Comprobante</th><th data-tour="ingresos-acciones">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="10">Cargando ingresos...</td></tr>}
              {!loading && ingresosFiltrados.map((item, index) => (
                <tr key={item.id}>
                  <td>{formatDate(getFechaReal(item))}</td>
                  <td>
                    {item.conceptosItems?.length ? (
                      <div className="concept-tags">
                        {item.conceptosItems.map((concepto, index) => (
                          <span key={`${concepto.nombre}-${index}`}>{concepto.nombre}</span>
                        ))}
                      </div>
                    ) : (
                      item.concepto
                    )}
                  </td>
                  <td>{item.sociedad}</td>
                  <td>
                    {item.sede}
                    {item.porcentajeAplicado && (
                      <small className="table-cell-note">
                        {item.porcentajeAplicado}% de {formatMoney(item.importeOriginal)}
                      </small>
                    )}
                  </td>
                  <td>{item.origen}</td>
                  <td><strong>{formatMoney(item.importe)}</strong></td>
                  <td>{item.cobro}</td>
                  <td><span className={`status-badge ${item.estado.toLowerCase()}`}>{item.estado}</span></td>
                  <td>{item.comprobante || "-"}</td>
                  <td>
                    <div className="table-actions" data-tour={index === 0 ? "ingresos-acciones" : undefined}>
                      {item.datosFiscales?.qrUrl && (
                        <button title="Ver comprobante en AFIP" onClick={() => verAfip(item.datosFiscales.qrUrl)}>
                          <ExternalLink size={16} />
                        </button>
                      )}
                      {canEditIngresos && item.estado === "Pendiente" && (
                        <button title="Marcar como cobrado" onClick={() => marcarCobrado(item.id)}>
                          <CheckCircle size={16} />
                        </button>
                      )}
                      {canDeleteIngresos && (
                        <button title="Eliminar ingreso" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && ingresosFiltrados.length === 0 && (
                <tr><td colSpan="10">No se encontraron ingresos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "nuevo" && canCreateIngresos && (
        <Modal title="Nuevo ingreso" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>Fecha <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></label>
            <label>
              Entidad pagadora / Razón social
              <EntityAutocomplete
                required
                value={form.sociedad}
                onChange={updateClienteManual}
                items={clientes}
                placeholder="Buscar por razon social o CUIT..."
                emptyMessage="No hay clientes que coincidan."
              />
              <small>Podés elegir un cliente existente o cargarlo manualmente.</small>
            </label>
            <label>Sede
              <select value={form.sedeId} onChange={(e) => setForm({ ...form, sedeId: e.target.value })} disabled={sedeBloqueada} required>
                {sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}
              </select>
            </label>
            <label>Origen
              <select value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })}>
                <option>Obra Social</option><option>Prepaga</option><option>Particular</option><option>Factura fiscal</option>
              </select>
            </label>
            <label>Importe <input type="number" step="0.01" min="0" required value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} /></label>
            <label>Fecha de vencimiento <input type="date" value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} /></label>
            <div className="full split-box">
              <div className="split-header">
                <div>
                  <strong>Distribución por sedes</strong>
                  <small>
                    Opcional. Si no agregás distribución, se aplica el 100% a la sede seleccionada.
                  </small>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={agregarDistribucion}
                >
                  Agregar sede
                </button>
              </div>

              {form.distribuciones?.length > 0 && (
                <div className="split-table">
                  {form.distribuciones.map((item, index) => (
                    <div className="split-row" key={index}>
                      <select
                        value={item.sedeId}
                        onChange={(e) =>
                          actualizarDistribucion(index, "sedeId", e.target.value)
                        }
                        required
                      >
                        <option value="">Seleccionar sede</option>
                        {getSedesDisponibles(index).map((sede) => (
                          <option key={sede.id} value={sede.id}>
                            {sede.nombre}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="%"
                        value={item.porcentaje}
                        onChange={(e) =>
                          actualizarDistribucion(index, "porcentaje", e.target.value)
                        }
                        onBlur={(e) =>
                          actualizarDistribucion(index, "porcentaje", e.target.value || 0)
                        }
                        required
                      />

                      <span>{formatMoney(calcularImporteDistribuido(item.porcentaje))}</span>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => eliminarDistribucion(index)}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}

                  <div className="split-total">
                    <strong>Total distribuido: {totalDistribucion()}%</strong>
                    <span>
                      {Math.abs(totalDistribucion() - 100) <= 0.01
                        ? "Correcto"
                        : "Debe sumar 100%"}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <label>Forma de cobro
              <select value={form.cobro} onChange={(e) => setForm({ ...form, cobro: e.target.value })}>
                <option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Cheque</option>
              </select>
            </label>
            <label>Estado
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                <option>Pendiente</option><option>Cobrado</option>
              </select>
            </label>
            <ConceptoSelector
              tipo="ingreso"
              items={conceptoItems}
              value={form.conceptosItems || []}
              onChange={(items) =>
                setForm({
                  ...form,
                  conceptosItems: items,
                  concepto: items.map((item) => item.nombre).join(", "),
                })
              }
              onItemsChange={setConceptoItems}
            />
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando..." : "Guardar ingreso"}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "revisarFactura" && ingresoPendiente && canCreateIngresos && (
        <Modal title="Revisar factura importada" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={confirmarIngresoImportado}>
            <div className="full">
              <p className="form-note">El sistema leyó los datos fiscales del QR. Completá manualmente el concepto real antes de guardar.</p>
            </div>
            <label>Fecha <input type="date" required value={ingresoPendiente.fecha} onChange={(e) => setIngresoPendiente({ ...ingresoPendiente, fecha: e.target.value })} /></label>
            <label>Comprobante <input value={ingresoPendiente.comprobante} disabled /></label>
            <label>
              Entidad pagadora / CUIT
              <EntityAutocomplete
                required
                value={ingresoPendiente.sociedad}
                onChange={updateClienteImportado}
                items={clientes}
                placeholder="Buscar por razon social o CUIT..."
                emptyMessage="No hay clientes que coincidan."
              />
            </label>
            <label>Sede
              <select value={ingresoPendiente.sedeId} onChange={(e) => setIngresoPendiente({ ...ingresoPendiente, sedeId: e.target.value })} required>
                {sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}
              </select>
            </label>
            <label>Importe <input type="number" step="0.01" min="0" required value={ingresoPendiente.importe} onChange={(e) => setIngresoPendiente({ ...ingresoPendiente, importe: e.target.value })} /></label>
            <label>Fecha de vencimiento <input type="date" value={ingresoPendiente.fechaVencimiento || ""} onChange={(e) => setIngresoPendiente({ ...ingresoPendiente, fechaVencimiento: e.target.value })} /></label>
            <label>Forma de cobro
              <select value={ingresoPendiente.cobro} onChange={(e) => setIngresoPendiente({ ...ingresoPendiente, cobro: e.target.value })}>
                <option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option><option>Cheque</option>
              </select>
            </label>
            <label>Estado
              <select value={ingresoPendiente.estado} onChange={(e) => setIngresoPendiente({ ...ingresoPendiente, estado: e.target.value })}>
                <option>Pendiente</option><option>Cobrado</option>
              </select>
            </label>
            <label>Origen
              <select value={ingresoPendiente.origen} onChange={(e) => setIngresoPendiente({ ...ingresoPendiente, origen: e.target.value })}>
                <option>Factura fiscal</option><option>Obra Social</option><option>Prepaga</option><option>Particular</option>
              </select>
            </label>
            <ConceptoSelector
              tipo="ingreso"
              items={conceptoItems}
              value={ingresoPendiente.conceptosItems || []}
              onChange={(items) =>
                setIngresoPendiente({
                  ...ingresoPendiente,
                  conceptosItems: items,
                  concepto: items.map((item) => item.nombre).join(", "),
                })
              }
              onItemsChange={setConceptoItems}
            />
            <div className="full detail-grid">
              <div><span>Archivo</span><strong>{ingresoPendiente.archivo}</strong></div>
              <div><span>CAE / CAEA</span><strong>{ingresoPendiente.datosFiscales.codAut || "-"}</strong></div>
              <div><span>Moneda</span><strong>{ingresoPendiente.datosFiscales.moneda || "-"}</strong></div>
              <div><span>Cotización</span><strong>{ingresoPendiente.datosFiscales.ctz || "-"}</strong></div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando..." : "Confirmar y guardar"}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

