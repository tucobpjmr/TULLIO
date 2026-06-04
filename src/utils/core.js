import { TEAM, CATEGORIES } from "../data/mockData.js";

// ─── UTILS ─────────────────────────────────────────────────────────────────
export const getMember = id => TEAM.find(m => m.id === id);
// Agenti selezionabili come assegnatari (attivi e non in attesa di approvazione)
export const getAssignableTeam = () => TEAM.filter(m => m.active !== false && !m.pending);
export const formatDate = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};
export const formatTime = iso => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};
export const isOverdue = task => task.status !== "done" && task.dueDate && new Date(task.dueDate) < new Date();
export const getDayKey = iso => iso ? new Date(iso).toDateString() : null;
export const isActiveTask = t => !t.deletedAt;
export const getActiveTasks = tasks => tasks.filter(isActiveTask);
export const getTrashedTasks = tasks => tasks.filter(t => t.deletedAt);
