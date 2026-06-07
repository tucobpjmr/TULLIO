// ─── CONTEXT & REDUCER ─────────────────────────────────────────────────────
import { createContext } from "react";
import { TEAM, CATEGORIES, CURRENT_USER, _syncCurrentUser, INITIAL_TASKS, STATUS_LABELS } from "../data/mockData.js";
import { INITIAL_NOTICES } from "../data/taskTemplates.js";
import { getMember } from "../utils/helpers.js";
import { canAccessAdmin, canViewTask, canEditTask, canCreateTaskCategory, isAdmin } from "../utils/permissions.js";

export const AppContext = createContext(null);

// Mutazione in-place per mantenere il riferimento alle costanti TEAM/CATEGORIES
export const _syncTeam = (newTeam) => { TEAM.length = 0; newTeam.forEach(m => TEAM.push(m)); };
export const _syncCategories = (newCats) => {
  Object.keys(CATEGORIES).forEach(k => { delete CATEGORIES[k]; });
  Object.entries(newCats).forEach(([k, v]) => { CATEGORIES[k] = v; });
};

// Azioni che generano una voce nel log attività
const LOGGED_ACTIONS = new Set([
  "ADD_TASK", "ADD_TASKS_BULK", "UPDATE_TASK", "MOVE_TASK", "ADD_COMMENT",
  "DELETE_TASK", "RESTORE_TASK", "PURGE_TASK", "EMPTY_TRASH",
  "ADD_TEAM_MEMBER", "UPDATE_TEAM_MEMBER", "APPROVE_TEAM_MEMBER", "TOGGLE_TEAM_MEMBER_ACTIVE", "REMOVE_TEAM_MEMBER",
  "ADD_CATEGORY", "UPDATE_CATEGORY", "REMOVE_CATEGORY",
  "RESTORE_BACKUP",
  "ADD_NOTICE", "UPDATE_NOTICE", "DELETE_NOTICE",
]);

const buildLogEntry = (action, state) => {
  const t = action.type;
  const stamp = new Date().toISOString();
  const taskOf = id => state.tasks.find(x => x.id === id)?.title || id;
  const map = {
    ADD_TASK: () => `Creato task "${action.payload.title}"`,
    ADD_TASKS_BULK: () => `Creati ${action.payload.length} task in blocco`,
    UPDATE_TASK: () => `Aggiornato task "${taskOf(action.payload.id)}"`,
    MOVE_TASK: () => `Task "${taskOf(action.payload.taskId)}" spostato in ${STATUS_LABELS[action.payload.newStatus]}`,
    ADD_COMMENT: () => `Commento su "${taskOf(action.payload.taskId)}"`,
    DELETE_TASK: () => `Task "${taskOf(action.payload)}" nel cestino`,
    RESTORE_TASK: () => `Ripristinato task "${taskOf(action.payload)}"`,
    PURGE_TASK: () => `Eliminato definitivamente "${taskOf(action.payload)}"`,
    EMPTY_TRASH: () => `Cestino svuotato`,
    ADD_TEAM_MEMBER: () => `Aggiunto agente "${action.payload.name}"`,
    UPDATE_TEAM_MEMBER: () => `Modificato agente "${action.payload.name || action.payload.id}"`,
    APPROVE_TEAM_MEMBER: () => `Approvato agente "${getMember(action.payload)?.name || action.payload}"`,
    TOGGLE_TEAM_MEMBER_ACTIVE: () => `Agente "${getMember(action.payload)?.name || action.payload}" attivato/disattivato`,
    REMOVE_TEAM_MEMBER: () => `Rimosso agente "${getMember(action.payload)?.name || action.payload}"`,
    ADD_CATEGORY: () => `Aggiunta categoria "${action.payload.label}"`,
    UPDATE_CATEGORY: () => `Modificata categoria "${action.payload.key}"`,
    REMOVE_CATEGORY: () => `Rimossa categoria "${action.payload}"`,
    RESTORE_BACKUP: () => `Backup ripristinato`,
    ADD_NOTICE: () => `Pubblicato avviso in bacheca`,
    UPDATE_NOTICE: () => `Modificato avviso in bacheca`,
    DELETE_NOTICE: () => `Rimosso avviso dalla bacheca`,
  };
  return { id: `log-${stamp}-${Math.random().toString(36).slice(2,7)}`, time: stamp, type: t, text: (map[t] || (() => t))() };
};

function baseReducer(state, action) {
  const uid = state.currentUserId;
  const _denied = (msg = "Non hai i permessi per questa azione") =>
    ({ ...state, toast: { message: msg, type: "error" } });

  switch (action.type) {
    case "SET_VIEW": {
      // Solo admin può aprire la vista Admin
      if (action.payload === "admin" && !canAccessAdmin(uid)) {
        return _denied("Non hai i permessi per accedere all'Admin");
      }
      return { ...state, activeView: action.payload };
    }
    case "SET_SELECTED_TASK": {
      // Non permettere di aprire un task non visibile
      if (action.payload && !canViewTask(action.payload, uid)) {
        return _denied("Non hai i permessi per visualizzare questa task");
      }
      return { ...state, selectedTask: action.payload };
    }
    case "SET_CURRENT_USER": {
      const newId = action.payload;
      const m = getMember(newId);
      if (!m) return state;
      _syncCurrentUser(newId);
      // Se l'utente non può più accedere alla view corrente, riporta a dashboard
      const activeView = (state.activeView === "admin" && !canAccessAdmin(newId))
        ? "dashboard"
        : state.activeView;
      return {
        ...state,
        currentUserId: newId,
        activeView,
        selectedTask: null,
        toast: { message: `Ora stai usando l'app come ${m.name} (${m.role})`, type: "success" },
      };
    }
    case "MOVE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload.taskId);
      if (!prev) return state;
      if (!canEditTask(prev, uid)) return _denied();
      const prevStatus = prev?.status;
      const tasks = state.tasks.map(t =>
        t.id === action.payload.taskId ? { ...t, status: action.payload.newStatus } : t
      );
      const toast = action.swipe
        ? { message: `✓ Spostato in "${STATUS_LABELS[action.payload.newStatus]}"`, type: "success", undoable: true }
        : { message: `Task spostato in "${STATUS_LABELS[action.payload.newStatus]}"`, type: "success" };
      const lastAction = action.swipe
        ? { type: "MOVE_TASK", taskId: action.payload.taskId, prevStatus }
        : state.lastAction;
      return { ...state, tasks, toast, lastAction };
    }
    case "ADD_TASK": {
      if (!canCreateTaskCategory(action.payload.category, uid)) {
        return _denied("Non puoi creare task di questa categoria");
      }
      const tasks = [action.payload, ...state.tasks];
      return { ...state, tasks, toast: { message: "Task creato con successo!", type: "success" } };
    }
    case "ADD_TASKS_BULK": {
      const bad = action.payload.find(t => !canCreateTaskCategory(t.category, uid));
      if (bad) return _denied("Alcune task hanno categorie che non puoi creare");
      const tasks = [...action.payload, ...state.tasks];
      return { ...state, tasks, toast: { message: `${action.payload.length} task creati!`, type: "success" } };
    }
    case "UPDATE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload.id);
      if (!prev) return state;
      if (!canEditTask(prev, uid)) return _denied();
      const tasks = state.tasks.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t);
      const selectedTask = state.selectedTask?.id === action.payload.id
        ? { ...state.selectedTask, ...action.payload }
        : state.selectedTask;
      const toast = action.swipe
        ? { message: action.toastMessage || "Task aggiornato!", type: "success", undoable: true }
        : { message: "Task aggiornato!", type: "success" };
      const lastAction = action.swipe && prev
        ? { type: "UPDATE_TASK", taskId: action.payload.id, prevSnapshot: prev }
        : state.lastAction;
      return { ...state, tasks, selectedTask, toast, lastAction };
    }
    case "ADD_COMMENT": {
      const prev = state.tasks.find(t => t.id === action.payload.taskId);
      if (!prev) return state;
      if (!canViewTask(prev, uid)) return _denied("Non puoi commentare questa task");
      const tasks = state.tasks.map(t =>
        t.id === action.payload.taskId
          ? { ...t, comments: [...(t.comments || []), action.payload.comment] }
          : t
      );
      const selectedTask = state.selectedTask?.id === action.payload.taskId
        ? { ...state.selectedTask, comments: [...(state.selectedTask.comments || []), action.payload.comment] }
        : state.selectedTask;
      return { ...state, tasks, selectedTask };
    }
    case "DELETE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload);
      if (!prev) return state;
      if (!canEditTask(prev, uid)) return _denied();
      const tasks = state.tasks.map(t =>
        t.id === action.payload ? { ...t, deletedAt: new Date().toISOString() } : t
      );
      const selectedTask = state.selectedTask?.id === action.payload ? null : state.selectedTask;
      const toast = action.swipe
        ? { message: "🗑️ Spostato nel cestino", type: "success", undoable: true }
        : { message: "Task spostato nel cestino", type: "success" };
      const lastAction = action.swipe
        ? { type: "DELETE_TASK", taskId: action.payload }
        : state.lastAction;
      return { ...state, tasks, selectedTask, toast, lastAction };
    }
    case "RESTORE_TASK": {
      if (!isAdmin(uid)) return _denied("Solo Admin può gestire il cestino");
      const tasks = state.tasks.map(t =>
        t.id === action.payload ? { ...t, deletedAt: null } : t
      );
      return { ...state, tasks, toast: { message: "Task ripristinato!", type: "success" } };
    }
    case "PURGE_TASK": {
      if (!isAdmin(uid)) return _denied("Solo Admin può gestire il cestino");
      const tasks = state.tasks.filter(t => t.id !== action.payload);
      return { ...state, tasks, toast: { message: "Task eliminato definitivamente", type: "success" } };
    }
    case "EMPTY_TRASH": {
      if (!isAdmin(uid)) return _denied("Solo Admin può svuotare il cestino");
      const count = state.tasks.filter(t => t.deletedAt).length;
      const tasks = state.tasks.filter(t => !t.deletedAt);
      return { ...state, tasks, toast: { message: `Cestino svuotato (${count} task eliminati)`, type: "success" } };
    }

    // ─── ADMIN: TEAM ───
    case "ADD_TEAM_MEMBER": {
      const team = [...state.team, action.payload];
      _syncTeam(team);
      return { ...state, team, toast: { message: `Agente "${action.payload.name}" aggiunto`, type: "success" } };
    }
    case "UPDATE_TEAM_MEMBER": {
      const team = state.team.map(m => m.id === action.payload.id ? { ...m, ...action.payload } : m);
      _syncTeam(team);
      return { ...state, team, toast: { message: "Agente aggiornato", type: "success" } };
    }
    case "APPROVE_TEAM_MEMBER": {
      const team = state.team.map(m => m.id === action.payload ? { ...m, pending: false, active: true } : m);
      _syncTeam(team);
      return { ...state, team, toast: { message: "Agente approvato e attivato!", type: "success" } };
    }
    case "TOGGLE_TEAM_MEMBER_ACTIVE": {
      const team = state.team.map(m => m.id === action.payload ? { ...m, active: !m.active } : m);
      _syncTeam(team);
      const target = team.find(m => m.id === action.payload);
      return { ...state, team, toast: { message: target?.active ? "Agente attivato" : "Agente disattivato", type: "success" } };
    }
    case "REMOVE_TEAM_MEMBER": {
      // Non rimuove davvero se ha task assegnati: si limita a disattivare e segnare pending=false
      const team = state.team.filter(m => m.id !== action.payload);
      _syncTeam(team);
      return { ...state, team, toast: { message: "Agente rimosso", type: "success" } };
    }

    // ─── ADMIN: CATEGORIES ───
    case "ADD_CATEGORY": {
      const { key, ...rest } = action.payload;
      const categories = { ...state.categories, [key]: rest };
      _syncCategories(categories);
      return { ...state, categories, toast: { message: `Categoria "${rest.label}" aggiunta`, type: "success" } };
    }
    case "UPDATE_CATEGORY": {
      const { key, ...rest } = action.payload;
      const categories = { ...state.categories, [key]: { ...state.categories[key], ...rest } };
      _syncCategories(categories);
      return { ...state, categories, toast: { message: "Categoria aggiornata", type: "success" } };
    }
    case "REMOVE_CATEGORY": {
      const { [action.payload]: _, ...rest } = state.categories;
      _syncCategories(rest);
      return { ...state, categories: rest, toast: { message: "Categoria rimossa", type: "success" } };
    }

    // ─── ADMIN: AGENZIA & BACKUP ───
    case "SET_AGENCY_NAME": {
      return { ...state, agencyName: action.payload };
    }
    case "RESTORE_BACKUP": {
      const { tasks, team, categories, agencyName, notices } = action.payload;
      if (team) _syncTeam(team);
      if (categories) _syncCategories(categories);
      return {
        ...state,
        tasks: tasks ?? state.tasks,
        team: team ?? state.team,
        categories: categories ?? state.categories,
        agencyName: agencyName ?? state.agencyName,
        notices: notices ?? state.notices,
        toast: { message: "Backup ripristinato con successo!", type: "success" }
      };
    }
    case "CLEAR_ACTIVITY_LOG": {
      return { ...state, activityLog: [], toast: { message: "Log attività svuotato", type: "success" } };
    }

    // ─── BACHECA AVVISI ───
    case "ADD_NOTICE": {
      const notices = [action.payload, ...state.notices];
      return { ...state, notices, toast: { message: "Avviso pubblicato in bacheca", type: "success" } };
    }
    case "UPDATE_NOTICE": {
      const notices = state.notices.map(n =>
        n.id === action.payload.id
          ? { ...n, ...action.payload, updatedAt: new Date().toISOString() }
          : n
      );
      return { ...state, notices, toast: { message: "Avviso aggiornato", type: "success" } };
    }
    case "DELETE_NOTICE": {
      const notices = state.notices.filter(n => n.id !== action.payload);
      return { ...state, notices, toast: { message: "Avviso rimosso dalla bacheca", type: "success" } };
    }
    case "TOGGLE_PIN_NOTICE": {
      const notices = state.notices.map(n =>
        n.id === action.payload ? { ...n, pinned: !n.pinned } : n
      );
      return { ...state, notices };
    }

    case "CLEAR_TOAST": return { ...state, toast: null };
    case "UNDO_LAST_ACTION": {
      const la = state.lastAction;
      if (!la) return state;
      if (la.type === "MOVE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? { ...t, status: la.prevStatus } : t);
        return { ...state, tasks, toast: { message: "Azione annullata", type: "success" }, lastAction: null };
      }
      if (la.type === "DELETE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? { ...t, deletedAt: null } : t);
        return { ...state, tasks, toast: { message: "Azione annullata", type: "success" }, lastAction: null };
      }
      if (la.type === "UPDATE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? la.prevSnapshot : t);
        const selectedTask = state.selectedTask?.id === la.taskId ? la.prevSnapshot : state.selectedTask;
        return { ...state, tasks, selectedTask, toast: { message: "Azione annullata", type: "success" }, lastAction: null };
      }
      return state;
    }
    case "SET_SEARCH": return { ...state, searchQuery: action.payload };
    case "TOGGLE_NOTIF": return { ...state, showNotif: !state.showNotif };
    case "SET_FILTER": return { ...state, filters: { ...state.filters, ...action.payload } };
    case "TOGGLE_SIDEBAR": return { ...state, sidebarCollapsed: !state.sidebarCollapsed };

    // ─── PROFILO PERSONALE (non admin-only) ───
    case "UPDATE_OWN_PROFILE": {
      const uid = state.currentUserId;
      const { name, avatar, color, email, phone, photoUrl } = action.payload;
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (avatar !== undefined) updates.avatar = avatar;
      if (color !== undefined) updates.color = color;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (photoUrl !== undefined) updates.photoUrl = photoUrl;
      const team = state.team.map(m => m.id === uid ? { ...m, ...updates } : m);
      _syncTeam(team);
      return { ...state, team, toast: { message: "Profilo aggiornato!", type: "success" } };
    }

    default: return state;
  }
}

// Azioni che richiedono ruolo Admin (vedono pre-check nel wrapper sotto)
const ADMIN_ONLY_ACTIONS = new Set([
  "ADD_TEAM_MEMBER", "UPDATE_TEAM_MEMBER", "APPROVE_TEAM_MEMBER",
  "TOGGLE_TEAM_MEMBER_ACTIVE", "REMOVE_TEAM_MEMBER",
  "ADD_CATEGORY", "UPDATE_CATEGORY", "REMOVE_CATEGORY",
  "SET_AGENCY_NAME", "RESTORE_BACKUP", "CLEAR_ACTIVITY_LOG",
]);

// Wrapper che aggiunge automaticamente al log le azioni rilevanti
export function reducer(state, action) {
  // Pre-check permessi Admin (centralizzato — non sporca i singoli case)
  if (ADMIN_ONLY_ACTIONS.has(action.type) && !isAdmin(state.currentUserId)) {
    return { ...state, toast: { message: "Solo Admin può eseguire questa azione", type: "error" } };
  }
  const next = baseReducer(state, action);
  if (LOGGED_ACTIONS.has(action.type) && next !== state) {
    const entry = buildLogEntry(action, state);
    const activityLog = [entry, ...(next.activityLog || [])].slice(0, 100);
    return { ...next, activityLog };
  }
  return next;
}

export const initialState = {
  tasks: INITIAL_TASKS,
  team: TEAM,
  categories: CATEGORIES,
  agencyName: "VoyageDesk",
  notices: INITIAL_NOTICES,
  activityLog: [],
  activeView: "dashboard",
  selectedTask: null,
  toast: null,
  searchQuery: "",
  showNotif: false,
  sidebarCollapsed: false,
  filters: { assignee: "", category: "", priority: "", status: "", client: "" },
  lastAction: null, // { type, payload, undo: () => state-patch } per swipe-actions undo
  currentUserId: CURRENT_USER, // v0.8: utente loggato (con switcher in Topbar)
};
