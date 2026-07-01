import { supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "cedim_support_tickets";
const STORAGE_BUCKET = "genetics-archivos";

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST202" ||
    error?.status === 404 ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the function")
  );
}

function isAdmin(user) {
  return user?.role === "Administrador" || user?.rol === "Administrador";
}

function userId(user) {
  return user?.id || user?.authUserId || user?.auth_user_id || null;
}

function userName(user) {
  return user?.name || user?.nombre || user?.usuario || user?.email || "Usuario";
}

function userEmail(user) {
  return user?.email || "";
}

function createFallbackTicketRow(form, currentUser, id = crypto.randomUUID()) {
  const now = new Date().toISOString();

  return {
    id,
    codigo: "",
    titulo: form.titulo,
    descripcion: form.descripcion,
    categoria: form.categoria,
    prioridad: form.prioridad,
    prioridad_interna: form.prioridad,
    estado: "Abierto",
    creado_por: userId(currentUser),
    usuario_id: userId(currentUser),
    usuario_nombre: userName(currentUser),
    usuario_email: userEmail(currentUser),
    sede_id: currentUser?.sedeId || null,
    screenshot_path: form.screenshotPath || "",
    page_url: form.pageUrl || "",
    page_path: form.pagePath || "",
    browser_info: form.browserInfo || "",
    created_at: now,
    updated_at: now,
    ticket_comentarios: [],
    ticket_adjuntos: [],
  };
}

function formatTicketCode(value) {
  if (!value) return "TCK-000000";
  return `TCK-${String(value).padStart(6, "0")}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function mapComment(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    comentario: row.comentario || "",
    usuarioId: row.usuario_id,
    usuarioNombre: row.usuario?.nombre || row.usuario_nombre || "Usuario",
    usuarioEmail: row.usuario?.email || row.usuario_email || "",
    interno: Boolean(row.interno),
    fecha: formatDate(row.created_at),
    createdAt: row.created_at,
  };
}

function mapAttachment(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    nombre: row.nombre_archivo || row.nombre || "",
    path: row.storage_path || row.path || "",
    tipo: row.mime_type || row.tipo || "",
    size: row.size_bytes || row.size || 0,
  };
}

function mapTicket(row) {
  const adjuntos = (row.ticket_adjuntos || row.ticket_attachments || row.adjuntos || []).map(
    mapAttachment
  );

  return {
    id: row.id,
    codigo: row.codigo || (row.numero ? formatTicketCode(row.numero) : ""),
    numero: row.numero,
    titulo: row.titulo || "",
    descripcion: row.descripcion || "",
    categoria: row.categoria || "Consulta",
    prioridad: row.prioridad || "Media",
    estado: row.estado || "Abierto",
    prioridadInterna: row.prioridad_interna || row.prioridad || "Media",
    usuarioId: row.creado_por || row.usuario_id,
    usuarioNombre: row.creador?.nombre || row.usuario_nombre || "Usuario",
    usuarioEmail: row.creador?.email || row.usuario_email || "",
    asignadoA: row.asignado_a || "",
    asignadoNombre: row.asignado?.nombre || "",
    sedeId: row.sede_id || "",
    sedeNombre: row.sede?.nombre || "",
    fecha: formatDate(row.created_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    adjuntoNombre: adjuntos[0]?.nombre || row.adjunto_nombre || "",
    adjuntoPath: adjuntos[0]?.path || row.adjunto_path || "",
    adjuntoTipo: adjuntos[0]?.tipo || row.adjunto_tipo || "",
    adjuntoSize: adjuntos[0]?.size || row.adjunto_size || 0,
    screenshotPath: row.screenshot_path || row.captura_path || "",
    pageUrl: row.page_url || "",
    pagePath: row.page_path || "",
    browserInfo: row.browser_info || "",
    comentarios: (row.ticket_comentarios || row.ticket_comments || row.comentarios || []).map(
      mapComment
    ),
    adjuntos,
  };
}

function readLocalTickets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalTickets(tickets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

function getVisibleLocalTickets(user) {
  const tickets = readLocalTickets().map(mapTicket);
  if (isAdmin(user)) return tickets;

  const id = userId(user);
  const email = userEmail(user);
  return tickets.filter(
    (ticket) => ticket.usuarioId === id || (email && ticket.usuarioEmail === email)
  );
}

async function withLocalFallback(action, fallback) {
  try {
    return await action();
  } catch (error) {
    if (isMissingTableError(error)) {
      return fallback();
    }
    throw error;
  }
}

export async function getTickets(currentUser) {
  return withLocalFallback(
    async () => {
      let query = supabase
        .from("tickets")
        .select(`
          *,
          creador:usuarios!tickets_creado_por_fkey (id, nombre, email),
          asignado:usuarios!tickets_asignado_a_fkey (id, nombre, email),
          sede:sedes!tickets_sede_id_fkey (id, nombre),
          ticket_comentarios (
            *,
            usuario:usuarios (id, nombre, email)
          ),
          ticket_adjuntos (*)
        `)
        .order("created_at", { ascending: false });

      if (!isAdmin(currentUser)) {
        query = query.eq("creado_por", userId(currentUser));
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(mapTicket);
    },
    () => getVisibleLocalTickets(currentUser)
  );
}

export async function createTicket(form, currentUser) {
  return withLocalFallback(
    async () => {
      let data;
      const fallbackId = crypto.randomUUID();
      const { data: rpcData, error: rpcError } = await supabase.rpc("create_ticket_report", {
        ticket_titulo: form.titulo,
        ticket_descripcion: form.descripcion,
        ticket_categoria: form.categoria,
        ticket_prioridad: form.prioridad,
        ticket_sede_id: currentUser?.sedeId || null,
        ticket_screenshot_path: form.screenshotPath || null,
        ticket_page_url: form.pageUrl || null,
        ticket_page_path: form.pagePath || null,
        ticket_browser_info: form.browserInfo || null,
      });

      if (rpcError && !isMissingTableError(rpcError)) throw rpcError;

      if (rpcError) {
        const fallbackRow = createFallbackTicketRow(form, currentUser, fallbackId);
        const { error: insertError } = await supabase.from("tickets").insert({
          id: fallbackRow.id,
          titulo: fallbackRow.titulo,
          descripcion: fallbackRow.descripcion,
          categoria: fallbackRow.categoria,
          prioridad: fallbackRow.prioridad,
          estado: fallbackRow.estado,
          creado_por: fallbackRow.creado_por,
          sede_id: fallbackRow.sede_id,
          screenshot_path: fallbackRow.screenshot_path || null,
          page_url: fallbackRow.page_url || null,
          page_path: fallbackRow.page_path || null,
          browser_info: fallbackRow.browser_info || null,
        });

        if (insertError) throw insertError;
        data = fallbackRow;
      } else {
        data = rpcData;
      }

      if (form.adjuntoPath) {
        const { error: adjuntoError } = await supabase.from("ticket_adjuntos").insert({
          ticket_id: data.id,
          nombre_archivo: form.adjuntoNombre || "archivo",
          storage_path: form.adjuntoPath,
          mime_type: form.adjuntoTipo || null,
          size_bytes: form.adjuntoSize || null,
        });

        if (adjuntoError) throw adjuntoError;
      }

      try {
        await addTicketComment(data.id, form.descripcion, currentUser);
      } catch (commentError) {
        console.warn("No se pudo crear el comentario inicial del ticket:", commentError);
      }

      return mapTicket({ ...data, ticket_comentarios: [] });
    },
    () => {
      const tickets = readLocalTickets();
      const now = new Date().toISOString();
      const nextNumero =
        tickets.reduce((max, ticket) => Math.max(max, Number(ticket.numero) || 0), 0) + 1;

      const ticket = {
        id: crypto.randomUUID(),
        numero: nextNumero,
        codigo: formatTicketCode(nextNumero),
        titulo: form.titulo,
        descripcion: form.descripcion,
        categoria: form.categoria,
        prioridad: form.prioridad,
        prioridad_interna: form.prioridad,
        estado: "Abierto",
        creado_por: userId(currentUser),
        usuario_id: userId(currentUser),
        usuario_nombre: userName(currentUser),
        usuario_email: userEmail(currentUser),
        adjunto_nombre: form.adjuntoNombre || "",
        adjunto_path: form.adjuntoPath || "",
        adjunto_tipo: form.adjuntoTipo || "",
        adjunto_size: form.adjuntoSize || 0,
        screenshot_path: form.screenshotPath || "",
        page_url: form.pageUrl || "",
        page_path: form.pagePath || "",
        browser_info: form.browserInfo || "",
        created_at: now,
        updated_at: now,
        comentarios: [
          {
            id: crypto.randomUUID(),
            ticket_id: null,
            comentario: form.descripcion,
            usuario_id: userId(currentUser),
            usuario_nombre: userName(currentUser),
            usuario_email: userEmail(currentUser),
            interno: false,
            created_at: now,
          },
        ],
      };

      ticket.comentarios[0].ticket_id = ticket.id;
      writeLocalTickets([ticket, ...tickets]);
      return mapTicket(ticket);
    }
  );
}

export async function addTicketAttachment(ticketId, uploadedFile) {
  if (!ticketId || !uploadedFile?.path) return null;

  return withLocalFallback(
    async () => {
      const { data, error } = await supabase
        .from("ticket_adjuntos")
        .insert({
          ticket_id: ticketId,
          nombre_archivo: uploadedFile.nombre || uploadedFile.name || "archivo",
          storage_path: uploadedFile.path,
          mime_type: uploadedFile.tipo || uploadedFile.type || null,
          size_bytes: uploadedFile.size || null,
        })
        .select()
        .single();

      if (error) throw error;
      return mapAttachment(data);
    },
    () => {
      const tickets = readLocalTickets();
      const now = new Date().toISOString();
      const attachment = {
        id: crypto.randomUUID(),
        ticket_id: ticketId,
        nombre_archivo: uploadedFile.nombre || uploadedFile.name || "archivo",
        storage_path: uploadedFile.path,
        mime_type: uploadedFile.tipo || uploadedFile.type || "",
        size_bytes: uploadedFile.size || 0,
        created_at: now,
      };

      writeLocalTickets(
        tickets.map((ticket) =>
          ticket.id === ticketId
            ? {
                ...ticket,
                updated_at: now,
                adjuntos: [...(ticket.adjuntos || []), attachment],
              }
            : ticket
        )
      );

      return mapAttachment(attachment);
    }
  );
}

export async function uploadTicketFile(path, file) {
  if (!path || !file) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/png",
    });

  if (error) throw error;

  return {
    path: data?.path || path,
    nombre: file.name || path.split("/").pop() || "archivo",
    tipo: file.type || "",
    size: file.size || 0,
  };
}

export async function updateTicketScreenshot(ticketId, payload) {
  const nextValues = {
    screenshot_path: payload?.screenshotPath || payload?.screenshot_path || null,
    page_url: payload?.pageUrl || payload?.page_url || null,
    page_path: payload?.pagePath || payload?.page_path || null,
    browser_info: payload?.browserInfo || payload?.browser_info || null,
  };

  return withLocalFallback(
    async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc("set_ticket_screenshot", {
        ticket_id: ticketId,
        screenshot_path: nextValues.screenshot_path,
        page_url: nextValues.page_url,
        page_path: nextValues.page_path,
        browser_info: nextValues.browser_info,
      });

      if (!rpcError) return mapTicket(rpcData || { id: ticketId, ...nextValues });
      throw rpcError;
    },
    () => {
      const tickets = readLocalTickets();
      const now = new Date().toISOString();
      const nextTickets = tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              ...nextValues,
              updated_at: now,
            }
          : ticket
      );
      writeLocalTickets(nextTickets);
      return mapTicket(nextTickets.find((ticket) => ticket.id === ticketId));
    }
  );
}

export async function updateTicketAdmin(id, updates) {
  return withLocalFallback(
    async () => {
      const { data, error } = await supabase
        .from("tickets")
        .update({
          estado: updates.estado,
          prioridad: updates.prioridadInterna,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return mapTicket(data);
    },
    () => {
      const tickets = readLocalTickets();
      const nextTickets = tickets.map((ticket) =>
        ticket.id === id
          ? {
              ...ticket,
              estado: updates.estado,
              prioridad_interna: updates.prioridadInterna,
              updated_at: new Date().toISOString(),
            }
          : ticket
      );
      writeLocalTickets(nextTickets);
      return mapTicket(nextTickets.find((ticket) => ticket.id === id));
    }
  );
}

export async function addTicketComment(ticketId, comentario, currentUser) {
  const payload = {
    ticket_id: ticketId,
    comentario,
    usuario_id: userId(currentUser),
    interno: false,
  };

  return withLocalFallback(
    async () => {
      const { data, error } = await supabase
        .from("ticket_comentarios")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return mapComment(data);
    },
    () => {
      const tickets = readLocalTickets();
      const now = new Date().toISOString();
      const comment = {
        id: crypto.randomUUID(),
        ...payload,
        created_at: now,
      };

      writeLocalTickets(
        tickets.map((ticket) =>
          ticket.id === ticketId
            ? {
                ...ticket,
                updated_at: now,
                comentarios: [...(ticket.comentarios || []), comment],
              }
            : ticket
        )
      );

      return mapComment(comment);
    }
  );
}
