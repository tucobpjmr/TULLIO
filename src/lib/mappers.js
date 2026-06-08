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
    dueDate: row.due_date ?? null,
    estimatedHours: row.estimated_hours == null ? 0 : Number(row.estimated_hours),
    description: row.description ?? '',
    deletedAt: row.deleted_at ?? null,
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
