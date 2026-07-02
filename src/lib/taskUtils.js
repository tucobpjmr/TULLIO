// src/lib/taskUtils.js
// Utility pure (niente TEAM/CATEGORIES/CURRENT_USER) per task e date.

export const formatDate = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatTime = iso => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

export const getDayKey = iso => iso ? new Date(iso).toDateString() : null;

// Costruiscono inizio/fine giornata in ora LOCALE a partire da una stringa
// "YYYY-MM-DD" (es. il valore di un <input type="date">, usato dal filtro
// "Scadenza" della ricerca avanzata). new Date("YYYY-MM-DD") interpreta la
// stringa come UTC-mezzanotte (01:00/02:00 locale in Italia): senza
// normalizzare con setHours in locale, l'inizio giornata restava ancorato a
// quell'orario e scartava erroneamente i task con dueDate di primo mattino
// nello stesso giorno locale.
export const startOfLocalDay = dateStr => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
};
export const endOfLocalDay = dateStr => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const isOverdue = task =>
  task.status !== "done" && task.dueDate && new Date(task.dueDate) < new Date();

const HOURS_24 = 24 * 60 * 60 * 1000;

export const isUrgent = task => {
  if (!task.dueDate || task.status === "done") return false;
  const diff = new Date(task.dueDate).getTime() - Date.now();
  return diff >= 0 && diff <= HOURS_24;
};

export const isActiveTask = t => !t.deletedAt;
export const getActiveTasks = tasks => tasks.filter(isActiveTask);
export const getTrashedTasks = tasks => tasks.filter(t => t.deletedAt);
// Archivio: task completate ("done") e non cestinate. Il sistema convoglia qui
// le task chiuse, che non compaiono più nelle code attive della Dashboard.
export const isArchivedTask = t => !t.deletedAt && t.status === "done";
export const getArchivedTasks = tasks => tasks.filter(isArchivedTask);

// Task appartiene all'utente userId?
export const isMyTask = (task, userId) => task.assignees?.includes(userId);

// Task non ha assegnatari → è nella coda globale
export const isInGlobalQueue = task => !task.assignees || task.assignees.length === 0;
