import { isMyTask, isInGlobalQueue, isUrgent } from "../utils/taskFilters.js";

// Helper PURI sulla team list: `team`/`categories` vanno sempre passati
// esplicitamente. Nei componenti si ottengono via AppContext (useTeam/useCategories),
// nel reducer via state.team/state.categories.

export const getMember = (id, team) => team.find(m => m.id === id);

// Agenti selezionabili come assegnatari (attivi e non in attesa di approvazione)
export const getAssignableTeam = (team) => team.filter(m => m.active !== false && !m.pending);

// ─── PERMESSI (v0.8) ──────────────────────────────────────────────────────
// Ruoli logici derivati dal campo `role` del team member.
// - Admin       → tutto
// - Manager     → come Senior/Junior Agent (gestione propria coda + globale + visualizza urgenti altrui)
// - Senior/Junior Agent → idem Manager
// - Driver      → solo task categoria "transfer", solo coda personale
export const getRoleType = (userId, team) => {
  const m = getMember(userId, team);
  if (!m) return "agent";
  const r = (m.role || "").toLowerCase();
  if (r.includes("admin")) return "admin";
  if (r.includes("driver")) return "driver";
  if (r.includes("manager")) return "manager";
  return "agent"; // senior/junior agent
};

export const isAdmin = (userId, team) => getRoleType(userId, team) === "admin";
export const isDriver = (userId, team) => getRoleType(userId, team) === "driver";

// Può visualizzare il task?
export const canViewTask = (task, userId, team) => {
  const role = getRoleType(userId, team);
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
export const canEditTask = (task, userId, team) => {
  const role = getRoleType(userId, team);
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
export const canCreateTaskCategory = (category, userId, team) => {
  const role = getRoleType(userId, team);
  if (role === "admin") return true;
  if (role === "driver") return category === "transfer";
  return true; // manager/agent: tutte le categorie
};

// Può accedere all'Admin?
export const canAccessAdmin = (userId, team) => isAdmin(userId, team);

// Categorie selezionabili nei form per questo utente
export const getAvailableCategories = (userId, team, categories) => {
  if (isDriver(userId, team)) {
    return { transfer: categories.transfer };
  }
  return categories;
};

// Filtra una lista di task secondo le regole di visibilità
export const getVisibleTasks = (tasks, userId, team) => tasks.filter(t => canViewTask(t, userId, team));
