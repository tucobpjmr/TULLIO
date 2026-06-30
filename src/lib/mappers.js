// src/lib/mappers.js
// Conversione tra la shape app (camelCase, comments embedded) e la shape DB
// (snake_case, comments su tabella separata).

// Riconosce un uuid v4-ish per evitare di rigenerarlo se è già valido.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    // Fallback molto raro: nei browser moderni crypto.randomUUID è sempre presente.
    `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ----------------- TASKS -----------------

// DB row → app task (con comments embedded, se presenti).
export function fromDbTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignees: Array.isArray(row.assignees) ? row.assignees : [],
    client: row.client_id ?? null,
    praticaRef: row.pratica_ref ?? null,
    dueDate: row.due_date ?? null,
    estimatedHours: row.estimated_hours == null ? 0 : Number(row.estimated_hours),
    description: row.description ?? '',
    deletedAt: row.deleted_at ?? null,
    // completed_at è gestito dal DB (trigger set_task_completed_at): sola lettura
    // lato app, non viene mai scritto da toDbTask/toDbTaskPatch.
    completedAt: row.completed_at ?? null,
    comments: Array.isArray(row.comments)
      ? row.comments.map(fromDbComment)
      : [],
  };
}

// App task → DB row (per insert/update). Omette campi mai persistiti su DB
// (comments — tabella separata) e i timestamps gestiti dal DB.
export function toDbTask(task) {
  return {
    id: isUuid(task.id) ? task.id : newId(),
    title: task.title,
    category: task.category ?? null,
    priority: task.priority ?? null,
    status: task.status ?? 'todo',
    assignees: Array.isArray(task.assignees) ? task.assignees : [],
    client_id: task.client ?? null,
    pratica_ref: task.praticaRef ?? null,
    due_date: task.dueDate ?? null,
    estimated_hours: task.estimatedHours ?? null,
    description: task.description ?? null,
    deleted_at: task.deletedAt ?? null,
  };
}

// Per UPDATE_TASK l'app spedisce solo un patch parziale: traduco solo
// i campi presenti per non sovrascrivere il resto.
export function toDbTaskPatch(patch) {
  const out = {};
  if ('title' in patch) out.title = patch.title;
  if ('category' in patch) out.category = patch.category;
  if ('priority' in patch) out.priority = patch.priority;
  if ('status' in patch) out.status = patch.status;
  if ('assignees' in patch) out.assignees = patch.assignees ?? [];
  if ('client' in patch) out.client_id = patch.client ?? null;
  if ('praticaRef' in patch) out.pratica_ref = patch.praticaRef ?? null;
  if ('dueDate' in patch) out.due_date = patch.dueDate ?? null;
  if ('estimatedHours' in patch) out.estimated_hours = patch.estimatedHours ?? null;
  if ('description' in patch) out.description = patch.description ?? null;
  if ('deletedAt' in patch) out.deleted_at = patch.deletedAt ?? null;
  return out;
}

// ----------------- COMMENTS -----------------

// DB row (con join users(name)) → commento embedded nel task.
export function fromDbComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    user: row.users?.name ?? row.user ?? '',
    user_id: row.user_id,
    text: row.text,
    time: row.created_at,
  };
}

// ----------------- NOTICES -----------------

// DB row → app notice. Il DB non ha updated_at: replico created_at lato app
// per non rompere i componenti che lo leggono.
export function fromDbNotice(row) {
  if (!row) return null;
  return {
    id: row.id,
    text: row.text,
    color: row.color ?? null,
    pinned: !!row.pinned,
    author: row.author_id ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.created_at ?? null,
  };
}

export function toDbNotice(notice) {
  return {
    id: isUuid(notice.id) ? notice.id : newId(),
    text: notice.text,
    color: notice.color ?? null,
    pinned: !!notice.pinned,
    author_id: notice.author ?? null,
  };
}

export function toDbNoticePatch(patch) {
  const out = {};
  if ('text' in patch) out.text = patch.text;
  if ('color' in patch) out.color = patch.color;
  if ('pinned' in patch) out.pinned = !!patch.pinned;
  if ('author' in patch) out.author_id = patch.author ?? null;
  return out;
}

// ----------------- CONVERSATIONS -----------------

export function fromDbConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    name: row.name ?? null,
    icon: row.icon ?? null,
    participants: Array.isArray(row.participants) ? row.participants : [],
    pinned: !!row.pinned,
  };
}

export function toDbConversation(conv) {
  return {
    id: isUuid(conv.id) ? conv.id : newId(),
    type: conv.type,
    name: conv.name ?? null,
    icon: conv.icon ?? null,
    participants: Array.isArray(conv.participants) ? conv.participants : [],
    pinned: !!conv.pinned,
  };
}

// ----------------- MESSAGES -----------------

export function fromDbMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender: row.sender_id,
    type: row.type,
    text: row.text ?? '',
    fileName: row.file_name ?? null,
    // fileSize è bigint (byte): l'UI lo formatta con formatFileSize.
    fileSize: row.file_size ?? null,
    fileType: row.file_type ?? null,
    fileUrl: row.file_url ?? null,
    duration: row.duration ?? null,
    waveform: row.waveform ?? null,
    replyTo: row.reply_to ?? null,
    taskRef: row.task_ref ?? null,
    // originalSenderId valorizzato solo sui messaggi inoltrati (Fase 3):
    // contiene l'UID di chi ha originato il messaggio originale, anche dopo
    // catene di forward. NULL = messaggio non inoltrato.
    originalSenderId: row.original_sender_id ?? null,
    pinned: !!row.pinned,
    // Fase 3 pin metadata: audit di chi/quando ha fissato. NULL se non fissato.
    pinnedAt: row.pinned_at ?? null,
    pinnedBy: row.pinned_by ?? null,
    reactions: row.reactions ?? {},
    readBy: Array.isArray(row.read_by) ? row.read_by : [],
    time: row.created_at,
  };
}

export function toDbMessage(msg, conversationId) {
  // Step M: gli upload reali hanno fileSize numerico (byte). I vecchi mock
  // usavano stringhe human-readable ("245 KB") → su DB (bigint) restano null.
  const fileSizeBytes =
    typeof msg.fileSize === 'number' ? msg.fileSize : null;
  return {
    id: isUuid(msg.id) ? msg.id : newId(),
    conversation_id: conversationId,
    sender_id: msg.sender,
    type: msg.type ?? 'text',
    text: msg.text ?? null,
    file_name: msg.fileName ?? null,
    file_size: fileSizeBytes,
    file_type: msg.fileType ?? null,
    file_url: msg.fileUrl ?? null,
    duration: msg.duration ?? null,
    waveform: msg.waveform ?? null,
    reply_to: msg.replyTo ?? null,
    task_ref: msg.taskRef ?? null,
    original_sender_id: msg.originalSenderId ?? null,
    pinned: !!msg.pinned,
    pinned_at: msg.pinnedAt ?? null,
    pinned_by: msg.pinnedBy ?? null,
    reactions: msg.reactions ?? {},
    read_by: Array.isArray(msg.readBy) ? msg.readBy : [],
  };
}

// ----------------- CLIENTS -----------------
export function fromDbClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function toDbClient(client) {
  return {
    name: client.name,
    email: client.email ?? null,
    phone: client.phone ?? null,
    address: client.address ?? null,
    city: client.city ?? null,
    notes: client.notes ?? null,
  };
}

// ----------------- CATEGORIES -----------------
export function fromDbCategory(row) {
  if (!row) return null;
  return { key: row.key, label: row.label, icon: row.icon ?? "", color: row.color, bg: row.bg };
}

export function toDbCategory(cat) {
  return { key: cat.key, label: cat.label, icon: cat.icon ?? "", color: cat.color, bg: cat.bg };
}

// ----------------- NOTIFICATIONS -----------------
// DB row → app notification. Payload arbitrario per tipo.
export function fromDbNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    payload: row.payload ?? {},
    read: !!row.read,
    createdAt: row.created_at,
  };
}
