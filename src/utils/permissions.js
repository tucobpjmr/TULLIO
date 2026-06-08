// ─── PERMESSI (v0.8) ──────────────────────────────────────────────────────
// Ruoli logici derivati dal campo `role` del team member.
// - Admin       → tutto
// - Manager     → come Senior/Junior Agent (gestione propria coda + globale + visualizza urgenti altrui)
// - Senior/Junior Agent → idem Manager
// - Driver      → solo task categoria "transfer", solo coda personale
import { getMember } from "./helpers.js";
import { CATEGORIES } from "../data/mockData.js";

export const getRoleType = (userId) => {
  const m = getMember(userId);
  if (!m) return "agent";
  const r = (m.role || "").toLowerCase();
  if (r.includes("admin")) return "admin";
  if (r.includes("driver")) return "driver";
  if (r.includes("manager")) return "manager";
  return "agent"; // senior/junior agent
};

export const isAdmin = (userId) => getRoleType(userId) === "admin";
export const isDriver = (userId) => getRoleType(userId) === "driver";

// Task è "mio" se sono nell'array assignees
export const isMyTask = (task, userId) => task.assignees?.includes(userId);

// Task è "in coda globale" se non ha assegnatari
export const isInGlobalQueue = (task) => !task.assignees || task.assignees.length === 0;

// Task è "urgente" (< 24h alla scadenza, non ancora done)
const HOURS_24 = 24 * 60 * 60 * 1000;
export const isUrgent = (task) => {
  if (!task.dueDate || task.status === "done") return false;
  const diff = new Date(task.dueDate).getTime() - Date.now();
  return diff >= 0 && diff <= HOURS_24;
};
// (Nota: gli scaduti — diff < 0 — non sono considerati "urgenti < 24h": già visibili come overdue di chi li ha)

// Può visualizzare il task?
export const canViewTask = (task, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") {
    // Solo le proprie task transfer
    return isMyTask(task, userId);
  }
  // manager/agent: proprie + globali + urgenti altrui
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  if (isUrgent(task)) return true;
  return false;
};

// Può modificare il task?
export const canEditTask = (task, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") {
    return task.category === "transfer" && (isMyTask(task, userId) || isInGlobalQueue(task));
  }
  // manager/agent: proprie + globali (non urgenti altrui — quelli sono read-only)
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  return false;
};

// Può creare un task con questa categoria?
export const canCreateTaskCategory = (category, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") return category === "transfer";
  return true; // manager/agent: tutte le categorie
};

// Può accedere all'Admin?
export const canAccessAdmin = (userId) => isAdmin(userId);

// Categorie selezionabili nei form per questo utente
export const getAvailableCategories = (userId) => {
  if (isDriver(userId)) {
    return { transfer: CATEGORIES.transfer };
  }
  return CATEGORIES;
};

// Filtra una lista di task secondo le regole di visibilità
export const getVisibleTasks = (tasks, userId) => tasks.filter(t => canViewTask(t, userId));

// ─── SIDEBAR / NAV ────────────────────────────────────────────────────────
export const NAV_ITEMS = [
  { id: "dashboard", icon: "📊", label: "Dashboard", roles: ["admin", "manager", "agent", "driver"] },
  { id: "calendar", icon: "📅", label: "Calendario", roles: ["admin", "manager", "agent", "driver"] },
  { id: "clients", icon: "🧑‍💼", label: "Clienti", roles: ["admin", "manager", "agent"] },
  { id: "team", icon: "👥", label: "Team", roles: ["admin", "manager", "agent"] },
  { id: "trash", icon: "🗑️", label: "Cestino", roles: ["admin"] },
  { id: "admin", icon: "⚙️", label: "Admin", roles: ["admin"] },
];

// Filtra NAV_ITEMS in base al ruolo dell'utente loggato
export const getNavItemsForUser = (userId) => {
  const role = getRoleType(userId);
  return NAV_ITEMS.filter(it => !it.roles || it.roles.includes(role));
};
