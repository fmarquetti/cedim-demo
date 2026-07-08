// src/pages/Egresos.jsx
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
  createEgreso,
  deleteEgreso,
  getEgresos,
  marcarEgresoPagado,
} from "../services/egresoService";
import { getSedes } from "../services/sedeService";
import { getCuentasBancarias } from "../services/cuentaBancariaService";
import { formatMoney, formatDate, toDate } from "../utils/format";
import { toast } from "../components/ToastProvider";
import { canPerform } from "../utils/permissions";
import { getDbSedeId } from "../utils/sedeUtils";
import { loadSafeBatch, notifyLoadErrors } from "../utils/loadSafe";

import ConceptoSelector from "../components/ConceptoSelector";
import { getConceptoItems } from "../services/conceptoItemService";
import { leerQRDesdePDF as leerQrFiscalDesdePdf, extraerDatosQRFiscal as extraerDatosQrFiscalUtil, tipoComprobanteLabel as tipoComprobanteLabelUtil } from "../utils/qrFiscal";
import { extraerFiscalDesdeDatosFiscales } from "../services/fiscalService";
import { getEntidadesCuentaCorriente, normalizeDocument, normalizeText } from "../services/cuentaCorrienteEntidadService";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const CATEGORIAS = [
  "Insumos",
  "Reactivos",
  "Servicios",
  "Sueldos",
  "Alquileres",
  "Mantenimiento",
];

const emptyForm = {
  fecha: new Date().toISOString().split("T")[0],
  proveedor: "",
  proveedorCuit: "",
  sociedad: "",
  fechaVencimiento: "",
  sedeId: "",
  concepto: "",
  conceptosItems: [],
  importe: "",
  categoria: "Insumos",
  estado: "Pendiente",
  distribuciones: [],
  detalleFiscal: {
    netoGravado: "",
    iva: "",
    exento: "",
    noGravado: "",
    percepcionIva: "",
    percepcionIibb: "",
    retencionGanancias: "",
    retencionIva: "",
    retencionIibb: "",
    otrosTributos: "",
  },
  medioPago: "",
  cuentaPago: "",
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
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );
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
    1: "Factura A",
    2: "Nota de Débito A",
    3: "Nota de Crédito A",
    6: "Factura B",
    7: "Nota de Débito B",
    8: "Nota de Crédito B",
    11: "Factura C",
    12: "Nota de Débito C",
    13: "Nota de Crédito C",
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

function detalleFiscalDesdeDatos(datos, importe) {
  const fiscal = extraerFiscalDesdeDatosFiscales(datos, importe);
  const concepto = fiscal.conceptos?.[0] || {};
  const suma = (categoria, codigo) =>
    (fiscal.tributos || [])
      .filter((item) => item.categoria === categoria && (!codigo || item.codigo === codigo))
      .reduce((acc, item) => acc + Number(item.importe || 0), 0);

  return {
    netoGravado: concepto.neto || "",
    iva: concepto.iva || "",
    exento: concepto.exento || "",
    noGravado: concepto.noGravado || "",
    percepcionIva: suma("percepcion", "PERC_IVA") || "",
    percepcionIibb: suma("percepcion", "PERC_IIBB") || "",
    retencionGanancias: suma("retencion", "RET_GANANCIAS") || "",
    retencionIva: suma("retencion", "RET_IVA") || "",
    retencionIibb: suma("retencion", "RET_IIBB") || "",
    otrosTributos: suma("otro") || "",
  };
}

export default function Egresos({ selectedSede, dbSedeId, currentUser }) {
  const facturaInputRef = useRef(null);
  const canCreateEgresos = canPerform(currentUser, "egresos", "create");
  const canEditEgresos = canPerform(currentUser, "egresos", "edit");
  const canDeleteEgresos = canPerform(currentUser, "egresos", "delete");

  const [egresos, setEgresos] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [proveedores, setProveedores] = useState([]);

  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("Todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");
  const [sociedadFiltro, setSociedadFiltro] = useState("Todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [modal, setModal] = useState(null);
  const [importandoFactura, setImportandoFactura] = useState(false);
  const [egresoPendiente, setEgresoPendiente] = useState(null);
  const [pagoPendiente, setPagoPendiente] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [conceptoItems, setConceptoItems] = useState([]);

  const selectedSedeName = selectedSede?.nombre || "Todas las sedes";

  const idSedeActiva = dbSedeId ?? getDbSedeId(selectedSede);
  const sedeBloqueada = Boolean(idSedeActiva);

  async function loadData(currentSedeId = idSedeActiva) {
    setLoading(true);
    const idParaFiltro = getDbSedeId(currentSedeId);
    const results = await loadSafeBatch({
      egresos: {
        label: "egresos",
        promise: getEgresos(idParaFiltro),
        fallback: [],
      },
      sedes: {
        label: "sedes para egresos",
        promise: getSedes(),
        fallback: [],
      },
      cuentasBancarias: {
        label: "cuentas bancarias para egresos",
        promise: getCuentasBancarias(idParaFiltro),
        fallback: [],
      },
      conceptos: {
        label: "conceptos de egresos",
        promise: getConceptoItems("egreso"),
        fallback: [],
      },
      proveedores: {
        label: "proveedores",
        promise: getEntidadesCuentaCorriente({ tipo: "proveedor", activa: true }),
        fallback: [],
      },
    });

    setEgresos(results.egresos.data || []);
    setSedes(results.sedes.data || []);
    setCuentasBancarias(results.cuentasBancarias.data || []);
    setConceptoItems(results.conceptos.data || []);
    setProveedores(results.proveedores.data || []);
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

  const categorias = useMemo(() => {
    return [...new Set(egresos.map((item) => item.categoria).filter(Boolean))].sort();
  }, [egresos]);

  const sociedades = useMemo(() => {
    return [...new Set(egresos.map((item) => item.sociedad).filter(Boolean))].sort();
  }, [egresos]);

  const cuentasPagoActivas = useMemo(() => {
    return (cuentasBancarias || []).filter((cuenta) => cuenta.activa);
  }, [cuentasBancarias]);

  const egresosFiltrados = useMemo(() => {
    const searchValue = search.toLowerCase().trim();
    const fechaDesde = toDate(desde);
    const fechaHasta = toDate(hasta);

    return egresos.filter((item) => {
      const fechaItem = toDate(getFechaReal(item));

      const matchSearch =
        !searchValue ||
        item.proveedor?.toLowerCase().includes(searchValue) ||
        item.sociedad?.toLowerCase().includes(searchValue) ||
        item.sede?.toLowerCase().includes(searchValue) ||
        item.concepto?.toLowerCase().includes(searchValue) ||
        item.categoria?.toLowerCase().includes(searchValue) ||
        item.comprobante?.toLowerCase().includes(searchValue);

      const matchEstado = estadoFiltro === "Todos" || item.estado === estadoFiltro;
      const matchCategoria =
        categoriaFiltro === "Todas" || item.categoria === categoriaFiltro;
      const matchSociedad =
        sociedadFiltro === "Todas" || item.sociedad === sociedadFiltro;
      const matchDesde = !fechaDesde || (fechaItem && fechaItem >= fechaDesde);
      const matchHasta = !fechaHasta || (fechaItem && fechaItem <= fechaHasta);

      return (
        matchSearch &&
        matchEstado &&
        matchCategoria &&
        matchSociedad &&
        matchDesde &&
        matchHasta
      );
    });
  }, [egresos, search, estadoFiltro, categoriaFiltro, sociedadFiltro, desde, hasta]);

  const totalFiltrado = egresosFiltrados.reduce(
    (acc, item) => acc + Number(item.importe || 0),
    0
  );

  const totalPagado = egresosFiltrados
    .filter((e) => e.estado === "Pagado")
    .reduce((acc, e) => acc + Number(e.importe || 0), 0);

  const totalPendiente = egresosFiltrados
    .filter((e) => e.estado === "Pendiente")
    .reduce((acc, e) => acc + Number(e.importe || 0), 0);

  const comprobantesFiscales = egresosFiltrados.filter(
    (item) => item.datosFiscales?.qrUrl
  );

  const resumenPorCategoria = useMemo(() => {
    const map = {};

    egresosFiltrados.forEach((item) => {
      const categoria = item.categoria || "Sin categoría";

      if (!map[categoria]) {
        map[categoria] = {
          categoria,
          total: 0,
          pagado: 0,
          pendiente: 0,
          cantidad: 0,
        };
      }

      map[categoria].total += Number(item.importe || 0);
      map[categoria].cantidad += 1;

      if (item.estado === "Pagado") {
        map[categoria].pagado += Number(item.importe || 0);
      } else {
        map[categoria].pendiente += Number(item.importe || 0);
      }
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [egresosFiltrados]);

  const nombreArchivo = useMemo(() => {
    const periodo =
      desde || hasta
        ? `${desde || "inicio"}_${hasta || "actual"}`
        : "todos_los_periodos";

    return `Egresos_${safeFileName(selectedSedeName)}_${safeFileName(periodo)}`;
  }, [selectedSedeName, desde, hasta]);

  function aplicarFiltroRapido(tipo) {
    const hoy = new Date();
    const isoHoy = hoy.toISOString().split("T")[0];

    if (tipo === "hoy") {
      setDesde(isoHoy);
      setHasta(isoHoy);
    }

    if (tipo === "mes") {
      setDesde(
        new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0]
      );
      setHasta(isoHoy);
    }

    if (tipo === "pendientes") setEstadoFiltro("Pendiente");

    if (tipo === "limpiar") {
      setSearch("");
      setEstadoFiltro("Todos");
      setCategoriaFiltro("Todas");
      setSociedadFiltro("Todas");
      setDesde("");
      setHasta("");
    }
  }

  function openNuevoEgreso() {
    if (!canCreateEgresos) return;

    setForm({
      ...emptyForm,
      fecha: new Date().toISOString().split("T")[0],
      sedeId: sedeBloqueada ? idSedeActiva : sedes[0]?.id || "",
    });

    setModal("nuevo");
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

  function totalDistribucionEgresoPendiente() {
    return totalDistribucion(egresoPendiente?.distribuciones || []);
  }

  function getSedesDisponiblesEgresoPendiente(indexActual) {
    return getSedesDisponibles(indexActual, egresoPendiente?.distribuciones || []);
  }

  function agregarDistribucionEgresoPendiente() {
    setEgresoPendiente((prev) => {
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

  function actualizarDistribucionEgresoPendiente(index, field, value) {
    setEgresoPendiente((prev) => {
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

  function eliminarDistribucionEgresoPendiente(index) {
    setEgresoPendiente((prev) => {
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

  function calcularImporteDistribuidoEgresoPendiente(porcentaje) {
    const importe = Number(egresoPendiente?.importe || 0);
    return (importe * Number(porcentaje || 0)) / 100;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!canCreateEgresos) return;

    if (!form.sedeId) {
      toast.error("Seleccioná una sede.");
      return;
    }

    if (!form.conceptosItems?.length && !form.concepto?.trim()) {
      toast.error("Seleccioná al menos un concepto o cargá uno manual.");
      return;
    }

    if (form.estado === "Pagado" && !form.medioPago) {
      toast.error("Indica con que se pago el egreso.");
      return;
    }

    if (form.estado === "Pagado" && form.medioPago !== "Efectivo" && !form.cuentaPago) {
      toast.error("Selecciona la cuenta usada para el pago.");
      return;
    }

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

    setSaving(true);

    try {
      await createEgreso(form);
      await loadData(idSedeActiva);
      setForm({
        ...emptyForm,
        sedeId: sedeBloqueada ? idSedeActiva : sedes[0]?.id || "",
      });
      setModal(null);
      toast.success("Egreso guardado correctamente.");
    } catch (error) {
      toast.error(error.message || "No se pudo crear el egreso.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!canDeleteEgresos) return;

    if (!window.confirm("¿Eliminar este egreso?")) return;

    setDeletingId(id);

    try {
      await deleteEgreso(id);
      await loadData(idSedeActiva);
      toast.success("Egreso eliminado.");
    } catch (error) {
      toast.error(error.message || "No se pudo eliminar el egreso.");
    } finally {
      setDeletingId(null);
    }
  }

  function abrirPagoDirecto(egreso) {
    if (!canEditEgresos) return;

    setPagoPendiente({
      id: egreso.id,
      descripcion: egreso.comprobante || egreso.concepto || egreso.proveedor,
      importe: egreso.importe,
      medioPago: "",
      cuentaPago: "",
    });
    setModal("pagoDirecto");
  }

  async function confirmarPagoDirecto(e) {
    e.preventDefault();
    if (!canEditEgresos) return;

    if (!pagoPendiente?.medioPago) {
      toast.error("Indica con que se pago el egreso.");
      return;
    }

    if (pagoPendiente.medioPago !== "Efectivo" && !pagoPendiente.cuentaPago) {
      toast.error("Selecciona la cuenta usada para el pago.");
      return;
    }

    try {
      setSaving(true);
      await marcarEgresoPagado(pagoPendiente.id, {
        medioPago: pagoPendiente.medioPago,
        cuentaPago: pagoPendiente.cuentaPago,
      });
      await loadData(idSedeActiva);
      setPagoPendiente(null);
      setModal(null);
      toast.success("Egreso marcado como pagado.");
    } catch (error) {
      toast.error(error.message || "No se pudo marcar como pagado.");
    } finally {
      setSaving(false);
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

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imageData.data, canvas.width, canvas.height);

      if (qr?.data) return qr.data;
    }

    throw new Error("No se encontró ningún código QR en el PDF.");
  }

  async function importarFacturaFiscal(e) {
    if (!canCreateEgresos) return;

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportandoFactura(true);

      const qrText = await leerQrFiscalDesdePdf(file);
      const datos = extraerDatosQrFiscalUtil(qrText);

      const tipoComprobante = tipoComprobanteLabelUtil(datos.tipoCmp);
      const puntoVenta = String(datos.ptoVta || "").padStart(4, "0");
      const numeroComprobante = String(datos.nroCmp || "").padStart(8, "0");
      const datosFiscales = {
        ...datos,
        qrUrl: qrText,
        tipoComprobante,
        puntoVenta,
        numeroComprobante,
      };

      const sedeDefault =
        sedeBloqueada
          ? sedes.find((s) => s.id === idSedeActiva)
          : sedes[0];

      setEgresoPendiente({
        fecha: formatFechaInput(datos.fecha),
        proveedor: `CUIT ${datos.cuit}`,
        proveedorCuit: datos.cuit || "",
        sociedad: "",
        fechaVencimiento: "",
        sedeId: sedeDefault?.id || "",
        concepto: "",
        conceptosItems: [],
        importe: Number(datos.importe || 0),
        categoria: "Insumos",
        estado: "Pendiente",
        medioPago: "",
        cuentaPago: "",
        archivo: file.name,
        comprobante: `${tipoComprobante} ${puntoVenta}-${numeroComprobante}`,
        datosFiscales,
        detalleFiscal: detalleFiscalDesdeDatos(datosFiscales, Number(datos.importe || 0)),
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

  async function confirmarEgresoImportado(e) {
    e.preventDefault();
    if (!canCreateEgresos) return;

    if (!egresoPendiente?.proveedor?.trim()) {
      toast.error("Debés cargar el proveedor antes de guardar el egreso.");
      return;
    }

    if (!egresoPendiente?.conceptosItems?.length && !egresoPendiente?.concepto?.trim()) {
      toast.error("Seleccioná al menos un concepto o cargá uno manual.");
      return;
    }

    if (!egresoPendiente?.sedeId) {
      toast.error("Seleccioná una sede.");
      return;
    }

    if (egresoPendiente.estado === "Pagado" && !egresoPendiente.medioPago) {
      toast.error("Indica con que se pago el egreso.");
      return;
    }

    if (egresoPendiente.estado === "Pagado" && egresoPendiente.medioPago !== "Efectivo" && !egresoPendiente.cuentaPago) {
      toast.error("Selecciona la cuenta usada para el pago.");
      return;
    }

    if (egresoPendiente.distribuciones?.length) {
      const total = totalDistribucion(egresoPendiente.distribuciones);

      if (Math.abs(total - 100) > 0.01) {
        toast.error("La distribución entre sedes debe sumar exactamente 100%.");
        return;
      }

      const sedesSeleccionadas = egresoPendiente.distribuciones.map((item) => item.sedeId);
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
      await createEgreso(egresoPendiente);
      await loadData(idSedeActiva);
      setEgresoPendiente(null);
      setModal(null);
      toast.success("Factura importada y guardada correctamente.");
    } catch (error) {
      toast.error(error.message || "No se pudo guardar el egreso importado.");
    } finally {
      setSaving(false);
    }
  }

  function findProveedor(value) {
    const term = normalizeText(value);
    const documento = normalizeDocument(value);
    if (!term && !documento) return null;

    return proveedores.find((proveedor) => {
      const nombre = normalizeText(proveedor.nombre);
      const doc = normalizeDocument(proveedor.documento);
      return (
        nombre === term ||
        nombre.startsWith(term) ||
        (documento && doc === documento) ||
        (documento && doc.startsWith(documento))
      );
    });
  }

  function applyProveedorToForm(current, proveedor) {
    if (!proveedor) return current;
    return {
      ...current,
      proveedor: proveedor.nombre,
      sociedad: proveedor.nombre,
      proveedorCuit: proveedor.documento || current.proveedorCuit || "",
    };
  }

  function updateProveedorManual(value) {
    setForm((prev) => applyProveedorToForm({ ...prev, proveedor: value }, findProveedor(value)));
  }

  function updateProveedorImportado(value) {
    setEgresoPendiente((prev) =>
      applyProveedorToForm({ ...prev, proveedor: value }, findProveedor(value))
    );
  }

  function renderDetalleFiscal(value, onChange) {
    const detalle = value || {};
    const update = (field, fieldValue) => onChange({ ...detalle, [field]: fieldValue });
    const fields = [
      ["netoGravado", "Neto gravado"],
      ["iva", "IVA"],
      ["exento", "Exento"],
      ["noGravado", "No gravado"],
      ["percepcionIva", "Percepcion IVA"],
      ["percepcionIibb", "Percepcion IIBB"],
      ["retencionGanancias", "Retencion Ganancias"],
      ["retencionIva", "Retencion IVA"],
      ["retencionIibb", "Retencion IIBB"],
      ["otrosTributos", "Otros tributos"],
    ];

    return (
      <div className="full split-box">
        <div className="split-header">
          <div>
            <strong>Detalle fiscal avanzado</strong>
            <small>Opcional. Permite discriminar IVA, conceptos no gravados y tributos.</small>
          </div>
        </div>

        <div className="form-grid">
          {fields.map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                type="number"
                min="0"
                step="0.01"
                value={detalle[field] || ""}
                onChange={(event) => update(field, event.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  function verAfip(qrUrl) {
    if (!qrUrl) {
      toast.error("Este comprobante no tiene URL fiscal disponible.");
      return;
    }

    window.open(qrUrl, "_blank", "noopener,noreferrer");
  }

  const exportarExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "CEDIM - TECNEW";
      workbook.created = new Date();

      const resumenSheet = workbook.addWorksheet("Resumen");
      resumenSheet.columns = [
        { header: "Indicador", key: "indicador", width: 34 },
        { header: "Valor", key: "valor", width: 20 },
      ];

      resumenSheet.addRows([
        { indicador: "Sede", valor: selectedSedeName },
        { indicador: "Desde", valor: desde ? formatDate(desde) : "Inicio" },
        { indicador: "Hasta", valor: hasta ? formatDate(hasta) : "Actual" },
        { indicador: "Total egresos", valor: totalFiltrado },
        { indicador: "Total pagado", valor: totalPagado },
        { indicador: "Total pendiente", valor: totalPendiente },
        { indicador: "Comprobantes fiscales", valor: comprobantesFiscales.length },
      ]);

      const categoriaSheet = workbook.addWorksheet("Resumen por categoría");
      categoriaSheet.columns = [
        { header: "Categoría", key: "categoria", width: 28 },
        { header: "Total", key: "total", width: 18 },
        { header: "Pagado", key: "pagado", width: 18 },
        { header: "Pendiente", key: "pendiente", width: 18 },
        { header: "Cantidad", key: "cantidad", width: 14 },
      ];
      categoriaSheet.addRows(resumenPorCategoria);

      const detalleSheet = workbook.addWorksheet("Egresos");
      detalleSheet.columns = [
        { header: "Fecha", key: "fecha", width: 14 },
        { header: "Proveedor", key: "proveedor", width: 30 },
        { header: "Razón social proveedor", key: "sociedad", width: 28 },
        { header: "Sede", key: "sede", width: 24 },
        { header: "Concepto", key: "concepto", width: 40 },
        { header: "Categoría", key: "categoria", width: 20 },
        { header: "Comprobante", key: "comprobante", width: 28 },
        { header: "Importe", key: "importe", width: 18 },
        { header: "Estado", key: "estado", width: 16 },
        { header: "Fiscal", key: "fiscal", width: 12 },
      ];

      detalleSheet.addRows(
        egresosFiltrados.map((item) => ({
          fecha: formatDate(getFechaReal(item)),
          proveedor: item.proveedor,
          sociedad: item.sociedad,
          sede: item.sede,
          concepto: item.concepto,
          categoria: item.categoria,
          comprobante: item.comprobante || "-",
          importe: item.importe,
          estado: item.estado,
          fiscal: item.datosFiscales?.qrUrl ? "Sí" : "No",
        }))
      );

      workbook.worksheets.forEach((sheet) => {
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E3A8A" },
        };

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

      [
        resumenSheet.getColumn("valor"),
        categoriaSheet.getColumn("total"),
        categoriaSheet.getColumn("pagado"),
        categoriaSheet.getColumn("pendiente"),
        detalleSheet.getColumn("importe"),
      ].forEach((col) => {
        col.numFmt = '"$"#,##0.00';
      });

      const buffer = await workbook.xlsx.writeBuffer();

      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${nombreArchivo}.xlsx`
      );

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

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("CEDIM", 14, 16);

      doc.setFontSize(15);
      doc.text("Reporte de egresos", 14, 26);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Reporte generado por plataforma de gestión CEDIM", 14, 32);

      doc.setDrawColor(210);
      doc.line(14, 37, pageWidth - 14, 37);

      doc.text(`Sede: ${selectedSedeName}`, 14, 44);
      doc.text(`Estado: ${estadoFiltro}`, 14, 49);
      doc.text(`Categoría: ${categoriaFiltro}`, 14, 54);
      doc.text(
        `Periodo: ${desde ? formatDate(desde) : "Inicio"} al ${hasta ? formatDate(hasta) : "Actual"
        }`,
        14,
        59
      );

      doc.setFont("helvetica", "bold");
      doc.text(`Total: ${formatMoney(totalFiltrado)}`, 155, 44);
      doc.text(`Pagado: ${formatMoney(totalPagado)}`, 155, 49);
      doc.text(`Pendiente: ${formatMoney(totalPendiente)}`, 155, 54);
      doc.text(`Fiscales: ${comprobantesFiscales.length}`, 155, 59);

      autoTable(doc, {
        startY: 68,
        head: [["Categoría", "Total", "Pagado", "Pendiente", "Cant."]],
        body: resumenPorCategoria.map((item) => [
          item.categoria,
          formatMoney(item.total),
          formatMoney(item.pagado),
          formatMoney(item.pendiente),
          item.cantidad,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "center" },
        },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [
          [
            "Fecha",
            "Proveedor",
            "Razón social proveedor",
            "Sede",
            "Concepto",
            "Categoría",
            "Importe",
            "Estado",
          ],
        ],
        body: egresosFiltrados.map((item) => [
          formatDate(getFechaReal(item)),
          item.proveedor,
          item.sociedad,
          item.sede,
          item.concepto,
          item.categoria,
          formatMoney(item.importe),
          item.estado,
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        columnStyles: { 6: { halign: "right" } },
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
      <div className="page-header" data-tour="egresos-header">
        <div>
          <h2>Egresos</h2>
          <p>Control de proveedores, gastos operativos, reactivos e insumos.</p>
        </div>

        <div className="header-actions">
          <input
            ref={facturaInputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={importarFacturaFiscal}
          />

          <button
            className="secondary-button"
            onClick={() => loadData(idSedeActiva)}
            disabled={loading}
            data-tour="egresos-actualizar"
          >
            <RefreshCw size={16} /> Actualizar
          </button>

          {canCreateEgresos && (
            <button
              className="secondary-button"
              onClick={() => facturaInputRef.current?.click()}
              disabled={importandoFactura}
              data-tour="egresos-importar-factura"
            >
              <Upload size={16} />
              {importandoFactura ? "Leyendo factura..." : "Importar factura PDF"}
            </button>
          )}

          {canCreateEgresos && (
            <button className="primary-button" onClick={openNuevoEgreso} data-tour="egresos-nuevo">
              <Plus size={16} /> Nuevo egreso
            </button>
          )}
        </div>
      </div>

      <datalist id="proveedores-egresos-lista">
        {proveedores.map((proveedor) => (
          <option
            key={proveedor.id}
            value={proveedor.nombre}
            label={proveedor.documento || ""}
          />
        ))}
      </datalist>

      <div className="stats-grid small">
        <div className="stat-card" data-tour="egresos-resumen-total">
          <div>
            <span>Total egresos</span>
            <strong>{formatMoney(totalFiltrado)}</strong>
            <small>{egresosFiltrados.length} registros filtrados</small>
          </div>
        </div>

        <div className="stat-card" data-tour="egresos-resumen-pagado">
          <div>
            <span>Total pagado</span>
            <strong>{formatMoney(totalPagado)}</strong>
            <small>Egresos confirmados</small>
          </div>
        </div>

        <div className="stat-card" data-tour="egresos-resumen-pendiente">
          <div>
            <span>Pendiente de pago</span>
            <strong>{formatMoney(totalPendiente)}</strong>
            <small>Proveedores y servicios</small>
          </div>
        </div>

        <div className="stat-card">
          <div>
            <span>Facturas fiscales</span>
            <strong>{comprobantesFiscales.length}</strong>
            <small>Con QR AFIP asociado</small>
          </div>
        </div>
      </div>

      <div className="filters-bar egresos-filters" data-tour="egresos-filtros">
        <input
          placeholder="Buscar por proveedor, razón social, sede, concepto, categoría o comprobante..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-tour="egresos-busqueda"
        />

        <label className="filter-field">
          <span>Estado</span>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} data-tour="egresos-filtro-estado">
            <option>Todos</option>
            <option>Pagado</option>
            <option>Pendiente</option>
          </select>
        </label>

        <label className="filter-field">
          <span>Categoría</span>
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            data-tour="egresos-filtro-categoria"
          >
            <option>Todas</option>
            {CATEGORIAS.map((categoria) => (
              <option key={categoria}>{categoria}</option>
            ))}
            {categorias
              .filter((categoria) => !CATEGORIAS.includes(categoria))
              .map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
          </select>
        </label>

        <label className="filter-field">
          <span>Razón social proveedor</span>
          <select
            value={sociedadFiltro}
            onChange={(e) => setSociedadFiltro(e.target.value)}
            data-tour="egresos-filtro-sociedad"
          >
            <option>Todas</option>
            {sociedades.map((sociedad) => (
              <option key={sociedad} value={sociedad}>
                {sociedad}
              </option>
            ))}
          </select>
        </label>

        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} data-tour="egresos-filtro-desde" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} data-tour="egresos-filtro-hasta" />

        <button className="secondary-button" onClick={() => aplicarFiltroRapido("hoy")} data-tour="egresos-filtro-hoy">
          Hoy
        </button>

        <button className="secondary-button" onClick={() => aplicarFiltroRapido("mes")} data-tour="egresos-filtro-mes">
          Este mes
        </button>

        <button
          className="secondary-button"
          onClick={() => aplicarFiltroRapido("pendientes")}
          data-tour="egresos-filtro-pendientes"
        >
          Pendientes
        </button>

        <button className="secondary-button" onClick={() => aplicarFiltroRapido("limpiar")} data-tour="egresos-filtro-limpiar">
          Limpiar
        </button>

        <button className="secondary-button" onClick={exportarExcel} disabled={loading} data-tour="egresos-exportar-excel">
          <FileSpreadsheet size={15} /> Excel
        </button>

        <button className="primary-button" onClick={exportarPDF} disabled={loading} data-tour="egresos-exportar-pdf">
          <FileText size={15} /> PDF
        </button>
      </div>

      <div className="panel">
        <h3>Resumen por categoría</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Pendiente</th>
                <th>Cantidad</th>
              </tr>
            </thead>

            <tbody>
              {resumenPorCategoria.map((item) => (
                <tr key={item.categoria}>
                  <td>
                    <strong>{item.categoria}</strong>
                  </td>
                  <td>{formatMoney(item.total)}</td>
                  <td>{formatMoney(item.pagado)}</td>
                  <td>{formatMoney(item.pendiente)}</td>
                  <td>{item.cantidad}</td>
                </tr>
              ))}

              {!loading && resumenPorCategoria.length === 0 && (
                <tr>
                  <td colSpan="5">No hay categorías para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" data-tour="egresos-tabla">
        <h3>Detalle de egresos</h3>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Razón social proveedor</th>
                <th>Sede</th>
                <th>Concepto</th>
                <th>Categoría</th>
                <th>Importe</th>
                <th>Estado</th>
                <th data-tour="egresos-acciones">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9">Cargando egresos...</td>
                </tr>
              )}

              {!loading &&
                egresosFiltrados.map((item, index) => (
                  <tr key={item.id}>
                    <td>{formatDate(getFechaReal(item))}</td>
                    <td>{item.proveedor}</td>
                    <td>{item.sociedad}</td>
                    <td>
                      {item.sede}
                      {item.porcentajeAplicado && (
                        <small className="table-cell-note">
                          {item.porcentajeAplicado}% de {formatMoney(item.importeOriginal)}
                        </small>
                      )}
                    </td>
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
                    <td>{item.categoria}</td>
                    <td>
                      <strong>{formatMoney(item.importe)}</strong>
                    </td>
                    <td>
                      <span className={`status-badge ${item.estado.toLowerCase()}`}>
                        {item.estado}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions" data-tour={index === 0 ? "egresos-acciones" : undefined}>
                        {item.datosFiscales?.qrUrl && (
                          <button
                            title="Ver comprobante en AFIP"
                            onClick={() => verAfip(item.datosFiscales.qrUrl)}
                          >
                            <ExternalLink size={16} />
                          </button>
                        )}

                        {canEditEgresos && item.estado === "Pendiente" && (
                          <button
                            title="Marcar como pagado"
                            onClick={() => abrirPagoDirecto(item)}
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}

                        {canDeleteEgresos && (
                          <button
                            title="Eliminar egreso"
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && egresosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="9">No se encontraron egresos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "pagoDirecto" && pagoPendiente && (
        <Modal title="Registrar pago del egreso" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={confirmarPagoDirecto}>
            <div className="full document-preview">
              <strong>{pagoPendiente.descripcion}</strong>
              <br />
              Importe: {formatMoney(pagoPendiente.importe)}
            </div>

            <label>
              Medio de pago
              <select
                required
                value={pagoPendiente.medioPago}
                onChange={(e) =>
                  setPagoPendiente({
                    ...pagoPendiente,
                    medioPago: e.target.value,
                    cuentaPago: e.target.value === "Efectivo" ? "" : pagoPendiente.cuentaPago,
                  })
                }
              >
                <option value="">Seleccionar medio</option>
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Débito</option>
                <option>Crédito</option>
                <option>Cheque</option>
                <option>Mercado Pago</option>
              </select>
            </label>

            {pagoPendiente.medioPago !== "Efectivo" && (
              <label>
                Cuenta de pago
                <select
                  required
                  value={pagoPendiente.cuentaPago}
                  onChange={(e) =>
                    setPagoPendiente({
                      ...pagoPendiente,
                      cuentaPago: e.target.value,
                    })
                  }
                >
                  <option value="">Seleccionar cuenta</option>
                  {cuentasPagoActivas.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.nombre}>
                      {cuenta.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Guardando..." : "Registrar pago"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "nuevo" && canCreateEgresos && (
        <Modal title="Nuevo egreso" onClose={() => setModal(null)}>
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
              Proveedor
              <input
                required
                list="proveedores-egresos-lista"
                value={form.proveedor}
                onChange={(e) => updateProveedorManual(e.target.value)}
              />
            </label>

            <label>
              Razón social del proveedor
              <input
                required
                value={form.sociedad}
                onChange={(e) => setForm({ ...form, sociedad: e.target.value })}
              />
              <small>Nombre legal o CUIT asociado al proveedor.</small>
            </label>

            <label>
              CUIT proveedor
              <input
                value={form.proveedorCuit}
                onChange={(e) =>
                  setForm((prev) =>
                    applyProveedorToForm(
                      { ...prev, proveedorCuit: e.target.value },
                      findProveedor(e.target.value)
                    )
                  )
                }
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
              Categoría
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              >
                {CATEGORIAS.map((categoria) => (
                  <option key={categoria}>{categoria}</option>
                ))}
              </select>
            </label>

            <label>
              Estado
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
              >
                <option>Pendiente</option>
                <option>Pagado</option>
              </select>
            </label>

            {form.estado === "Pagado" && (
              <>
                <label>
                  Medio de pago
                  <select
                    required
                    value={form.medioPago}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        medioPago: e.target.value,
                        cuentaPago: e.target.value === "Efectivo" ? "" : form.cuentaPago,
                      })
                    }
                  >
                    <option value="">Seleccionar medio</option>
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Débito</option>
                    <option>Crédito</option>
                    <option>Cheque</option>
                    <option>Mercado Pago</option>
                  </select>
                </label>

                {form.medioPago !== "Efectivo" && (
                  <label>
                    Cuenta de pago
                    <select
                      required
                      value={form.cuentaPago}
                      onChange={(e) => setForm({ ...form, cuentaPago: e.target.value })}
                    >
                      <option value="">Seleccionar cuenta</option>
                      {cuentasPagoActivas.map((cuenta) => (
                        <option key={cuenta.id} value={cuenta.nombre}>
                          {cuenta.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}

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
              Fecha de vencimiento
              <input
                type="date"
                value={form.fechaVencimiento}
                onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })}
              />
            </label>

            {renderDetalleFiscal(form.detalleFiscal, (detalleFiscal) =>
              setForm({ ...form, detalleFiscal })
            )}

            <div className="full split-box">
              <div className="split-header">
                <div>
                  <strong>Distribución por sedes</strong>
                  <small>
                    Opcional. Si no agregás distribución, se aplica el 100% a la sede seleccionada.
                  </small>
                </div>

                <button type="button" className="secondary-button" onClick={agregarDistribucion}>
                  Agregar sede
                </button>
              </div>

              {form.distribuciones?.length > 0 && (
                <div className="split-table">
                  {form.distribuciones.map((item, index) => (
                    <div className="split-row" key={index}>
                      <select
                        value={item.sedeId}
                        onChange={(e) => actualizarDistribucion(index, "sedeId", e.target.value)}
                        required
                      >
                        <option value="">Seleccionar sede</option>
                        {sedes.map((sede) => (
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

            <ConceptoSelector
              tipo="egreso"
              items={conceptoItems}
              value={form.conceptosItems}
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
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Guardando..." : "Guardar egreso"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "revisarFactura" && egresoPendiente && canCreateEgresos && (
        <Modal title="Revisar factura importada" onClose={() => setModal(null)}>
          <form className="form-grid" onSubmit={confirmarEgresoImportado}>
            <label>
              Fecha
              <input
                type="date"
                required
                value={egresoPendiente.fecha}
                onChange={(e) =>
                  setEgresoPendiente({ ...egresoPendiente, fecha: e.target.value })
                }
              />
            </label>

            <label>
              Proveedor
              <input
                required
                list="proveedores-egresos-lista"
                value={egresoPendiente.proveedor}
                onChange={(e) => updateProveedorImportado(e.target.value)}
              />
            </label>

            <label>
              Razón social del proveedor
              <input
                value={egresoPendiente.sociedad}
                onChange={(e) =>
                  setEgresoPendiente({ ...egresoPendiente, sociedad: e.target.value })
                }
              />
              <small>Nombre legal o CUIT asociado al proveedor.</small>
            </label>

            <label>
              CUIT proveedor
              <input
                value={egresoPendiente.proveedorCuit || ""}
                onChange={(e) =>
                  setEgresoPendiente((prev) =>
                    applyProveedorToForm(
                      { ...prev, proveedorCuit: e.target.value },
                      findProveedor(e.target.value)
                    )
                  )
                }
              />
            </label>

            <label>
              Sede
              <select
                value={egresoPendiente.sedeId}
                onChange={(e) =>
                  setEgresoPendiente({ ...egresoPendiente, sedeId: e.target.value })
                }
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
              Categoría
              <select
                value={egresoPendiente.categoria}
                onChange={(e) =>
                  setEgresoPendiente({ ...egresoPendiente, categoria: e.target.value })
                }
              >
                {CATEGORIAS.map((categoria) => (
                  <option key={categoria}>{categoria}</option>
                ))}
              </select>
            </label>

            <label>
              Estado
              <select
                value={egresoPendiente.estado}
                onChange={(e) =>
                  setEgresoPendiente({ ...egresoPendiente, estado: e.target.value })
                }
              >
                <option>Pendiente</option>
                <option>Pagado</option>
              </select>
            </label>

            {egresoPendiente.estado === "Pagado" && (
              <>
                <label>
                  Medio de pago
                  <select
                    required
                    value={egresoPendiente.medioPago || ""}
                    onChange={(e) =>
                      setEgresoPendiente({
                        ...egresoPendiente,
                        medioPago: e.target.value,
                        cuentaPago:
                          e.target.value === "Efectivo"
                            ? ""
                            : egresoPendiente.cuentaPago || "",
                      })
                    }
                  >
                    <option value="">Seleccionar medio</option>
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Débito</option>
                    <option>Crédito</option>
                    <option>Cheque</option>
                    <option>Mercado Pago</option>
                  </select>
                </label>

                {egresoPendiente.medioPago !== "Efectivo" && (
                  <label>
                    Cuenta de pago
                    <select
                      required
                      value={egresoPendiente.cuentaPago || ""}
                      onChange={(e) =>
                        setEgresoPendiente({
                          ...egresoPendiente,
                          cuentaPago: e.target.value,
                        })
                      }
                    >
                      <option value="">Seleccionar cuenta</option>
                      {cuentasPagoActivas.map((cuenta) => (
                        <option key={cuenta.id} value={cuenta.nombre}>
                          {cuenta.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}

            <label>
              Importe
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={egresoPendiente.importe}
                onChange={(e) =>
                  setEgresoPendiente({
                    ...egresoPendiente,
                    importe: e.target.value,
                  })
                }
              />
            </label>

            <label>
              Fecha de vencimiento
              <input
                type="date"
                value={egresoPendiente.fechaVencimiento || ""}
                onChange={(e) =>
                  setEgresoPendiente({
                    ...egresoPendiente,
                    fechaVencimiento: e.target.value,
                  })
                }
              />
            </label>

            {renderDetalleFiscal(egresoPendiente.detalleFiscal, (detalleFiscal) =>
              setEgresoPendiente({ ...egresoPendiente, detalleFiscal })
            )}

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
                  onClick={agregarDistribucionEgresoPendiente}
                >
                  Agregar sede
                </button>
              </div>

              {egresoPendiente.distribuciones?.length > 0 && (
                <div className="split-table">
                  {egresoPendiente.distribuciones.map((item, index) => (
                    <div className="split-row" key={index}>
                      <select
                        value={item.sedeId}
                        onChange={(e) =>
                          actualizarDistribucionEgresoPendiente(index, "sedeId", e.target.value)
                        }
                        required
                      >
                        <option value="">Seleccionar sede</option>
                        {getSedesDisponiblesEgresoPendiente(index).map((sede) => (
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
                          actualizarDistribucionEgresoPendiente(index, "porcentaje", e.target.value)
                        }
                        onBlur={(e) =>
                          actualizarDistribucionEgresoPendiente(index, "porcentaje", e.target.value || 0)
                        }
                        required
                      />

                      <span>{formatMoney(calcularImporteDistribuidoEgresoPendiente(item.porcentaje))}</span>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => eliminarDistribucionEgresoPendiente(index)}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}

                  <div className="split-total">
                    <strong>Total distribuido: {totalDistribucionEgresoPendiente()}%</strong>
                    <span>
                      {Math.abs(totalDistribucionEgresoPendiente() - 100) <= 0.01
                        ? "Correcto"
                        : "Debe sumar 100%"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <label>
              Comprobante
              <input
                value={egresoPendiente.comprobante || ""}
                onChange={(e) =>
                  setEgresoPendiente({
                    ...egresoPendiente,
                    comprobante: e.target.value,
                  })
                }
              />
            </label>

            <ConceptoSelector
              tipo="egreso"
              items={conceptoItems}
              value={egresoPendiente.conceptosItems || []}
              onChange={(items) =>
                setEgresoPendiente({
                  ...egresoPendiente,
                  conceptosItems: items,
                  concepto: items.map((item) => item.nombre).join(", "),
                })
              }
              onItemsChange={setConceptoItems}
            />

            <label className="full">
              Archivo
              <input
                value={egresoPendiente.archivo || ""}
                onChange={(e) =>
                  setEgresoPendiente({ ...egresoPendiente, archivo: e.target.value })
                }
              />
            </label>

            <div className="full document-preview">
              <strong>Datos detectados desde QR fiscal:</strong>
              <br />
              CUIT emisor: {egresoPendiente.datosFiscales?.cuit || "-"}
              <br />
              Comprobante: {egresoPendiente.datosFiscales?.tipoComprobante || "-"}{" "}
              {egresoPendiente.datosFiscales?.puntoVenta || ""}-
              {egresoPendiente.datosFiscales?.numeroComprobante || ""}
              <br />
              Importe detectado: {formatMoney(egresoPendiente.datosFiscales?.importe || egresoPendiente.importe)}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEgresoPendiente(null);
                  setModal(null);
                }}
              >
                Cancelar
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Guardando..." : "Guardar egreso importado"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
