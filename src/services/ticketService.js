import { supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "cedim_support_tickets";

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
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
    codigo: row.codigo || formatTicketCode(row.numero),
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
      const { data, error } = await supabase
        .from("tickets")
        .insert({
          titulo: form.titulo,
          descripcion: form.descripcion,
          categoria: form.categoria,
          prioridad: form.prioridad,
          estado: "Abierto",
          creado_por: userId(currentUser),
          sede_id: currentUser?.sedeId || null,
        })
        .select()
        .single();

      if (error) throw error;

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

      await addTicketComment(data.id, form.descripcion, currentUser);
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
