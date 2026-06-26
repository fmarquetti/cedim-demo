import { useEffect, useMemo, useRef, useState } from "react";
import {
    Plus,
    Monitor,
    ListChecks,
    PhoneCall,
    PlayCircle,
    CheckCircle,
    UserX,
    Ban,
    Trash2,
    RefreshCw,
} from "lucide-react";

import Modal from "../components/Modal";

import {
    cancelarTurno,
    createTurno,
    deleteTurno,
    finalizarTurno,
    getSedesOptions,
    getTurnosDelDia,
    iniciarAtencionTurno,
    llamarTurno,
    marcarAusenteTurno,
    subscribeTurnos,
} from "../services/turnosService";
import { getDbSedeId } from "../utils/sedeUtils";

const estadoOptions = [
    "Todos",
    "En espera",
    "Llamado",
    "En atención",
    "Finalizado",
    "Ausente",
    "Cancelado",
];

const tipoOptions = [
    "Todos",
    "Médico",
    "Análisis",
    "Ecografía",
    "Administración",
    "Otro",
];

const initialForm = {
    fecha: new Date().toISOString().slice(0, 10),
    sedeId: "",
    pacienteNombre: "",
    dni: "",
    telefono: "",
    obraSocial: "",
    tipoAtencion: "Análisis",
    area: "",
    consultorio: "",
    motivo: "",
    prioridad: "Normal",
    observaciones: "",
};

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function getEstadoClass(estado) {
    return normalizeText(estado).replaceAll(" ", "-");
}

function maskPatientName(nombre) {
    const parts = String(nombre || "").trim().split(" ").filter(Boolean);

    if (parts.length === 0) return "Paciente";
    if (parts.length === 1) return parts[0];

    return `${parts[0]} ${parts[1][0]}.`;
}

function getWaitMinutes(horaIngresoDb) {
    if (!horaIngresoDb) return 0;

    const start = new Date(horaIngresoDb).getTime();
    const now = Date.now();

    return Math.max(0, Math.floor((now - start) / 60000));
}

function sortTurnos(a, b) {
    const estadoOrden = {
        "Llamado": 1,
        "En atención": 2,
        "En espera": 3,
        "Finalizado": 4,
        "Ausente": 5,
        "Cancelado": 6,
    };

    const prioridadOrden = {
        Urgente: 1,
        Normal: 2,
    };

    const estadoA = estadoOrden[a.estado] || 99;
    const estadoB = estadoOrden[b.estado] || 99;

    if (estadoA !== estadoB) return estadoA - estadoB;

    const prioridadA = prioridadOrden[a.prioridad] || 99;
    const prioridadB = prioridadOrden[b.prioridad] || 99;

    if (prioridadA !== prioridadB) return prioridadA - prioridadB;

    return new Date(a.horaIngresoDb) - new Date(b.horaIngresoDb);
}

function getTurnoSortValue(turno, field) {
    const prioridadOrden = {
        Urgente: 1,
        Normal: 2,
    };

    if (field === "horaIngresoDb") {
        return new Date(turno.horaIngresoDb).getTime();
    }

    if (field === "tiempoEspera") {
        return getWaitMinutes(turno.horaIngresoDb);
    }

    if (field === "tipoAtencion") {
        return normalizeText(turno.tipoAtencion);
    }

    if (field === "areaConsultorio") {
        return normalizeText(turno.consultorio || turno.area || "");
    }

    if (field === "prioridad") {
        return prioridadOrden[turno.prioridad] || 99;
    }

    return normalizeText(turno[field] || "");
}

function sortTurnosByField(a, b, field, direction) {
    const valueA = getTurnoSortValue(a, field);
    const valueB = getTurnoSortValue(b, field);

    if (valueA < valueB) return direction === "asc" ? -1 : 1;
    if (valueA > valueB) return direction === "asc" ? 1 : -1;

    return sortTurnos(a, b);
}

export default function Turnos({ selectedSede, dbSedeId }) {
    const tvRef = useRef(null);

    const [turnos, setTurnos] = useState([]);
    const [sedes, setSedes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [modal, setModal] = useState(null);
    const [modoTv, setModoTv] = useState(false);

    const [search, setSearch] = useState("");
    const [estadoFiltro, setEstadoFiltro] = useState("Todos");
    const [tipoFiltro, setTipoFiltro] = useState("Todos");
    const [sedeFiltro, setSedeFiltro] = useState("");

    const [sortField, setSortField] = useState("horaIngresoDb");
    const [sortDirection, setSortDirection] = useState("asc");

    const [form, setForm] = useState(initialForm);

    const selectedSedeName = selectedSede?.nombre || "Todas las sedes";

    const activeSedeId = dbSedeId ?? getDbSedeId(selectedSede);

    const sedeBloqueada = Boolean(activeSedeId);

    async function cargarDatos(currentSedeId = activeSedeId) {
        try {
            setLoading(true);

            const sedesData = await getSedesOptions();
            setSedes(sedesData);

            const sedeIdConsulta = currentSedeId || null;

            const turnosData = await getTurnosDelDia({ sedeId: sedeIdConsulta });
            setTurnos(turnosData || []);

            if (sedeIdConsulta) {
                setSedeFiltro(sedeIdConsulta);
                setForm((prev) => ({
                    ...prev,
                    sedeId: prev.sedeId || sedeIdConsulta,
                }));
            } else {
                setSedeFiltro("");
                setForm((prev) => ({
                    ...prev,
                    sedeId: prev.sedeId || sedesData?.[0]?.id || "",
                }));
            }
        } catch (error) {
            console.error("Error cargando turnos:", error);
            alert("No se pudieron cargar los turnos.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        queueMicrotask(() => cargarDatos(activeSedeId));

        const unsubscribe = subscribeTurnos(() => {
            cargarDatos(activeSedeId);
        });

        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSedeId]);

    const turnosFiltrados = useMemo(() => {
        const normalizedSearch = normalizeText(search);

        return turnos
            .filter((turno) => {
                const matchSearch =
                    !normalizedSearch ||
                    normalizeText(turno.pacienteNombre).includes(normalizedSearch) ||
                    normalizeText(turno.dni).includes(normalizedSearch) ||
                    normalizeText(turno.motivo).includes(normalizedSearch) ||
                    normalizeText(turno.area).includes(normalizedSearch) ||
                    normalizeText(turno.consultorio).includes(normalizedSearch);

                const matchEstado =
                    estadoFiltro === "Todos" || turno.estado === estadoFiltro;

                const matchTipo =
                    tipoFiltro === "Todos" || turno.tipoAtencion === tipoFiltro;

                const matchSede =
                    !sedeFiltro ||
                    sedeFiltro === "Todas" ||
                    turno.sedeId === sedeFiltro;

                return matchSearch && matchEstado && matchTipo && matchSede;
            })
            .sort((a, b) => sortTurnosByField(a, b, sortField, sortDirection));
    }, [
        turnos,
        search,
        estadoFiltro,
        tipoFiltro,
        sedeFiltro,
        sortField,
        sortDirection,
    ]);

    const turnosTv = useMemo(() => {
        return turnosFiltrados.filter((turno) =>
            ["En espera", "Llamado", "En atención"].includes(turno.estado)
        );
    }, [turnosFiltrados]);

    const llamandoAhora = turnosTv.filter((turno) => turno.estado === "Llamado");
    const enAtencion = turnosTv.filter((turno) => turno.estado === "En atención");
    const enEspera = turnosTv.filter((turno) => turno.estado === "En espera");

    const totalActivos = turnos.filter((turno) =>
        ["En espera", "Llamado", "En atención"].includes(turno.estado)
    ).length;

    const totalEspera = turnos.filter((turno) => turno.estado === "En espera").length;
    const totalLlamados = turnos.filter((turno) => turno.estado === "Llamado").length;
    const totalAtencion = turnos.filter((turno) => turno.estado === "En atención").length;

    function handleSort(field) {
        if (sortField === field) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
    }

    function openNuevoTurno() {
        setForm({
            ...initialForm,
            sedeId: activeSedeId || sedeFiltro || sedes[0]?.id || "",
        });
        setModal("nuevo");
    }

    async function handleCreate(e) {
        e.preventDefault();

        if (!form.sedeId) {
            alert("Seleccioná una sede para el turno.");
            return;
        }

        try {
            setSaving(true);
            await createTurno(form);
            setModal(null);
            await cargarDatos(activeSedeId);
        } catch (error) {
            console.error("Error creando turno:", error);
            alert("No se pudo crear el turno.");
        } finally {
            setSaving(false);
        }
    }

    async function handleEstado(action, turnoId) {
        try {
            await action(turnoId);
            await cargarDatos(activeSedeId);
        } catch (error) {
            console.error("Error actualizando turno:", error);
            alert("No se pudo actualizar el turno.");
        }
    }

    async function handleDelete(id) {
        const confirmed = window.confirm(
            "¿Eliminar este turno? Esta acción debería usarse solo para corregir una carga incorrecta."
        );

        if (!confirmed) return;

        try {
            await deleteTurno(id);
            await cargarDatos(activeSedeId);
        } catch (error) {
            console.error("Error eliminando turno:", error);
            alert("No se pudo eliminar el turno.");
        }
    }

    async function enterTvMode() {
        setModoTv(true);

        setTimeout(async () => {
            try {
                const element = tvRef.current || document.documentElement;

                if (element.requestFullscreen) {
                    await element.requestFullscreen();
                } else if (element.webkitRequestFullscreen) {
                    await element.webkitRequestFullscreen();
                } else if (element.msRequestFullscreen) {
                    await element.msRequestFullscreen();
                }
            } catch (error) {
                console.warn("No se pudo activar pantalla completa:", error);
            }
        }, 100);
    }

    async function exitTvMode() {
        try {
            if (document.fullscreenElement && document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
                await document.webkitExitFullscreen();
            } else if (document.msFullscreenElement && document.msExitFullscreen) {
                await document.msExitFullscreen();
            }
        } catch (error) {
            console.warn("No se pudo salir de pantalla completa:", error);
        } finally {
            setModoTv(false);
        }
    }

    useEffect(() => {
        function handleFullscreenChange() {
            const isFullscreen =
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.msFullscreenElement;

            if (!isFullscreen && modoTv) {
                setModoTv(false);
            }
        }

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.addEventListener("msfullscreenchange", handleFullscreenChange);

        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.removeEventListener("msfullscreenchange", handleFullscreenChange);
        };
    }, [modoTv]);

    if (modoTv) {
        return (
            <section ref={tvRef} className="page turnos-tv-page">
                <div className="turnos-tv-header">
                    <div>
                        <span>Sala de espera</span>
                        <h2>{selectedSedeName}</h2>
                    </div>

                    <button className="secondary-button turnos-tv-exit" onClick={exitTvMode}>
                        <ListChecks size={16} /> Salir de TV
                    </button>
                </div>

                <div className="turnos-tv-grid">
                    <div className="turnos-tv-panel highlight">
                        <h3>Llamando ahora</h3>

                        {llamandoAhora.length > 0 ? (
                            llamandoAhora.map((turno) => (
                                <div className="turnos-tv-called" key={turno.id}>
                                    <strong>{maskPatientName(turno.pacienteNombre)}</strong>
                                    <span>
                                        {turno.consultorio || turno.area || turno.tipoAtencion}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="turnos-tv-empty">Sin llamados activos</div>
                        )}
                    </div>

                    <div className="turnos-tv-panel">
                        <h3>En atención</h3>

                        {enAtencion.length > 0 ? (
                            enAtencion.map((turno) => (
                                <div className="turnos-tv-row" key={turno.id}>
                                    <strong>{maskPatientName(turno.pacienteNombre)}</strong>
                                    <span>{turno.consultorio || turno.area || turno.tipoAtencion}</span>
                                </div>
                            ))
                        ) : (
                            <div className="turnos-tv-empty">Sin pacientes en atención</div>
                        )}
                    </div>
                </div>

                <div className="turnos-tv-panel waiting">
                    <h3>Pacientes en espera</h3>

                    <div className="turnos-tv-waiting-list">
                        {enEspera.length > 0 ? (
                            enEspera.map((turno, index) => (
                                <div className="turnos-tv-waiting-item" key={turno.id}>
                                    <span className="turnos-tv-number">{index + 1}</span>
                                    <strong>{maskPatientName(turno.pacienteNombre)}</strong>
                                    <span>{turno.tipoAtencion}</span>
                                    <small>Ingreso {turno.horaIngreso}</small>
                                </div>
                            ))
                        ) : (
                            <div className="turnos-tv-empty">No hay pacientes en espera</div>
                        )}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="page">
            <div className="page-header" data-tour="turnos-header">
                <div>
                    <h2>Turnos / Sala de espera</h2>
                    <p>
                        Gestión de ingresos por sede para atención médica, análisis y otros
                        servicios.
                    </p>
                </div>

                <div className="header-actions">
                    <button
                        className="secondary-button"
                        onClick={() => cargarDatos(activeSedeId)}
                    >
                        <RefreshCw size={16} /> Actualizar
                    </button>

                    <button className="secondary-button" onClick={enterTvMode}>
                        <Monitor size={16} /> Modo TV
                    </button>

                    <button className="primary-button" onClick={openNuevoTurno} data-tour="turnos-nuevo">
                        <Plus size={16} /> Nuevo ingreso
                    </button>
                </div>
            </div>

            <div className="stats-grid small">
                <div className="stat-card">
                    <div>
                        <span>Activos</span>
                        <strong>{totalActivos}</strong>
                        <small>En espera, llamados o en atención</small>
                    </div>
                </div>

                <div className="stat-card">
                    <div>
                        <span>En espera</span>
                        <strong>{totalEspera}</strong>
                        <small>Pacientes aguardando</small>
                    </div>
                </div>

                <div className="stat-card">
                    <div>
                        <span>Llamados</span>
                        <strong>{totalLlamados}</strong>
                        <small>Pendientes de ingreso</small>
                    </div>
                </div>

                <div className="stat-card">
                    <div>
                        <span>En atención</span>
                        <strong>{totalAtencion}</strong>
                        <small>Actualmente atendidos</small>
                    </div>
                </div>
            </div>

            <div className="filters-bar">
                <input
                    placeholder="Buscar por paciente, DNI, motivo, área o consultorio..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <select
                    value={sedeFiltro}
                    onChange={(e) => setSedeFiltro(e.target.value)}
                    disabled={sedeBloqueada}
                >
                    <option value="">Todas las sedes</option>
                    {sedes.map((sede) => (
                        <option key={sede.id} value={sede.id}>
                            {sede.nombre}
                        </option>
                    ))}
                </select>

                <select
                    value={estadoFiltro}
                    onChange={(e) => setEstadoFiltro(e.target.value)}
                    data-tour="turnos-estado"
                >
                    {estadoOptions.map((estado) => (
                        <option key={estado}>{estado}</option>
                    ))}
                </select>

                <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
                    {tipoOptions.map((tipo) => (
                        <option key={tipo}>{tipo}</option>
                    ))}
                </select>
            </div>

            <div className="table-card" data-tour="turnos-calendario">
                <table>
                    <thead>
                        <tr>
                            <th>
                                <button className="th-sort" onClick={() => handleSort("horaIngresoDb")}>
                                    Hora {sortField === "horaIngresoDb" && (sortDirection === "asc" ? "↑" : "↓")}
                                </button>
                            </th>

                            <th>Paciente</th>
                            <th>DNI</th>
                            <th>Sede</th>

                            <th>
                                <button className="th-sort" onClick={() => handleSort("tipoAtencion")}>
                                    Tipo {sortField === "tipoAtencion" && (sortDirection === "asc" ? "↑" : "↓")}
                                </button>
                            </th>

                            <th>
                                <button className="th-sort" onClick={() => handleSort("areaConsultorio")}>
                                    Área / Consultorio{" "}
                                    {sortField === "areaConsultorio" && (sortDirection === "asc" ? "↑" : "↓")}
                                </button>
                            </th>

                            <th>
                                <button className="th-sort" onClick={() => handleSort("prioridad")}>
                                    Prioridad {sortField === "prioridad" && (sortDirection === "asc" ? "↑" : "↓")}
                                </button>
                            </th>

                            <th>Estado</th>

                            <th>
                                <button className="th-sort" onClick={() => handleSort("tiempoEspera")}>
                                    Espera {sortField === "tiempoEspera" && (sortDirection === "asc" ? "↑" : "↓")}
                                </button>
                            </th>

                            <th data-tour="turnos-acciones">Acciones</th>
                        </tr>
                    </thead>

                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan="10">Cargando turnos...</td>
                            </tr>
                        )}

                        {!loading &&
                            turnosFiltrados.map((turno, index) => (
                                <tr key={turno.id}>
                                    <td>{turno.horaIngreso}</td>
                                    <td>{turno.pacienteNombre}</td>
                                    <td>{turno.dni || "-"}</td>
                                    <td>{turno.sede}</td>
                                    <td>{turno.tipoAtencion}</td>
                                    <td>{turno.consultorio || turno.area || "-"}</td>
                                    <td>
                                        <span className={`status-badge ${turno.prioridad.toLowerCase()}`}>
                                            {turno.prioridad}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${getEstadoClass(turno.estado)}`}>
                                            {turno.estado}
                                        </span>
                                    </td>
                                    <td>{getWaitMinutes(turno.horaIngresoDb)} min</td>
                                    <td>
                                        <div className="table-actions turnos-actions" data-tour={index === 0 ? "turnos-acciones" : undefined}>
                                            {turno.estado === "En espera" && (
                                                <button
                                                    title="Llamar paciente"
                                                    onClick={() => handleEstado(llamarTurno, turno.id)}
                                                >
                                                    <PhoneCall size={16} />
                                                </button>
                                            )}

                                            {turno.estado === "Llamado" && (
                                                <button
                                                    title="Iniciar atención"
                                                    onClick={() => handleEstado(iniciarAtencionTurno, turno.id)}
                                                >
                                                    <PlayCircle size={16} />
                                                </button>
                                            )}

                                            {turno.estado === "En atención" && (
                                                <button
                                                    title="Finalizar"
                                                    onClick={() => handleEstado(finalizarTurno, turno.id)}
                                                >
                                                    <CheckCircle size={16} />
                                                </button>
                                            )}

                                            {["En espera", "Llamado"].includes(turno.estado) && (
                                                <button
                                                    title="Marcar ausente"
                                                    onClick={() => handleEstado(marcarAusenteTurno, turno.id)}
                                                >
                                                    <UserX size={16} />
                                                </button>
                                            )}

                                            {!["Finalizado", "Cancelado"].includes(turno.estado) && (
                                                <button
                                                    title="Cancelar"
                                                    onClick={() => handleEstado(cancelarTurno, turno.id)}
                                                >
                                                    <Ban size={16} />
                                                </button>
                                            )}

                                            <button title="Eliminar" onClick={() => handleDelete(turno.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                        {!loading && turnosFiltrados.length === 0 && (
                            <tr>
                                <td colSpan="10">No hay turnos para los filtros seleccionados.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {modal === "nuevo" && (
                <Modal title="Nuevo ingreso a sala de espera" onClose={() => setModal(null)}>
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
                                required
                                value={form.sedeId}
                                onChange={(e) => setForm({ ...form, sedeId: e.target.value })}
                                disabled={sedeBloqueada}
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
                            Paciente
                            <input
                                required
                                value={form.pacienteNombre}
                                onChange={(e) =>
                                    setForm({ ...form, pacienteNombre: e.target.value })
                                }
                            />
                        </label>

                        <label>
                            DNI
                            <input
                                value={form.dni}
                                onChange={(e) => setForm({ ...form, dni: e.target.value })}
                            />
                        </label>

                        <label>
                            Teléfono
                            <input
                                value={form.telefono}
                                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                            />
                        </label>

                        <label>
                            Obra social / Prepaga
                            <input
                                value={form.obraSocial}
                                onChange={(e) => setForm({ ...form, obraSocial: e.target.value })}
                            />
                        </label>

                        <label>
                            Tipo de atención
                            <select
                                value={form.tipoAtencion}
                                onChange={(e) =>
                                    setForm({ ...form, tipoAtencion: e.target.value })
                                }
                            >
                                <option>Médico</option>
                                <option>Análisis</option>
                                <option>Ecografía</option>
                                <option>Administración</option>
                                <option>Otro</option>
                            </select>
                        </label>

                        <label>
                            Prioridad
                            <select
                                value={form.prioridad}
                                onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
                            >
                                <option>Normal</option>
                                <option>Urgente</option>
                            </select>
                        </label>

                        <label>
                            Área
                            <input
                                placeholder="Laboratorio, recepción, ecografía..."
                                value={form.area}
                                onChange={(e) => setForm({ ...form, area: e.target.value })}
                            />
                        </label>

                        <label>
                            Consultorio
                            <input
                                placeholder="Consultorio 1, Box 2..."
                                value={form.consultorio}
                                onChange={(e) => setForm({ ...form, consultorio: e.target.value })}
                            />
                        </label>

                        <label className="full">
                            Motivo / estudio solicitado
                            <input
                                value={form.motivo}
                                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                            />
                        </label>

                        <label className="full">
                            Observaciones
                            <input
                                value={form.observaciones}
                                onChange={(e) =>
                                    setForm({ ...form, observaciones: e.target.value })
                                }
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
                                {saving ? "Guardando..." : "Guardar ingreso"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </section>
    );
}
