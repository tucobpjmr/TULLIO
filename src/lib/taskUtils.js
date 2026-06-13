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

// Task appartiene all'utente userId?
export const isMyTask = (task, userId) => task.assignees?.includes(userId);

// Task non ha assegnatari → è nella coda globale
export const isInGlobalQueue = task => !task.assignees || task.assignees.length === 0;
