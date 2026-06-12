// Filtri/predicati su task. Non dipendono da team/categories.

export const isOverdue = task => task.status !== "done" && task.dueDate && new Date(task.dueDate) < new Date();

export const isActiveTask = t => !t.deletedAt;
export const getActiveTasks = tasks => tasks.filter(isActiveTask);
export const getTrashedTasks = tasks => tasks.filter(t => t.deletedAt);

// Task è "mio" se sono nell'array assignees
export const isMyTask = (task, userId) => task.assignees?.includes(userId);

// Task è "in coda globale" se non ha assegnatari
export const isInGlobalQueue = (task) => !task.assignees || task.assignees.length === 0;

// Task è "urgente" (< 24h alla scadenza, non ancora done).
// Gli scaduti (diff < 0) non sono considerati "urgenti < 24h": già visibili come
// overdue di chi li ha.
export const HOURS_24 = 24 * 60 * 60 * 1000;
export const isUrgent = (task) => {
  if (!task.dueDate || task.status === "done") return false;
  const diff = new Date(task.dueDate).getTime() - Date.now();
  return diff >= 0 && diff <= HOURS_24;
};
