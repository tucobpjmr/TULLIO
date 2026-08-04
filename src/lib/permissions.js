// src/lib/permissions.js
// Matrice permessi VoyageDesk, in funzioni PURE.
//
// Ogni funzione riceve il `team` come primo argomento invece di leggerlo da una
// variabile mutabile di modulo. È la differenza che conta: una decisione di
// autorizzazione ("questo utente può cancellare questo task?") non deve
// dipendere da uno stato scritto per effetto collaterale e potenzialmente
// disallineato da quello che React sta renderizzando. Qui l'input è esplicito,
// quindi il risultato è riproducibile e testabile senza montare nulla.
//
// Chi le usa:
//   - state/reducer.js       → passa state.team (fonte di verità di React)
//   - state/persistence.js   → stessa cosa, così i due livelli non divergono
//   - hooks/usePermissions   → per i componenti
//   - state/appGlobals.js    → shim legacy di transizione (vedi lì)
//
// NOTA sui ruoli: `member.role` è testo libero proveniente dal DB e dai select
// in TEAM_ROLES (lib/taskConstants.js). Il confronto è per sottostringa
// case-insensitive, come da sempre: "Senior Agent", "senior agent" e "agent"
// devono classificare allo stesso modo.

import { isMyTask, isInGlobalQueue, isUrgent } from './taskUtils.js';

// ─── LOOKUP TEAM ─────────────────────────────────────────────────────────────

/**
 * @param {TeamMember[]} team
 * @param {string} id
 * @returns {TeamMember|undefined}
 */
export const getMember = (team, id) => (team || []).find(m => m.id === id);

/**
 * Membri a cui è possibile assegnare un task: attivi e già approvati.
 * @param {TeamMember[]} team
 */
export const getAssignableTeam = (team) =>
  (team || []).filter(m => m.active !== false && !m.pending);

// ─── RUOLI ───────────────────────────────────────────────────────────────────
// - Admin          → tutto
// - Manager        → gestione propria coda + globale + visualizza urgenti altrui
// - Senior Agent   → idem Manager (può prendere task dalla coda globale)
// - Junior Agent   → solo task esplicitamente assegnati; non crea payment/admin
// - Driver         → solo task categoria "transfer", solo coda personale

/** @returns {'admin'|'driver'|'manager'|'agent'} */
export const getRoleType = (team, userId) => {
  const m = getMember(team, userId);
  if (!m) return 'agent';
  const r = (m.role || '').toLowerCase();
  if (r.includes('admin')) return 'admin';
  if (r.includes('driver')) return 'driver';
  if (r.includes('manager')) return 'manager';
  return 'agent';
};

// Sub-ruolo Agent: "Junior Agent" ha permessi ridotti; "Senior Agent" (e
// qualsiasi altro "agent") ha i permessi standard.
export const isJuniorAgent = (team, userId) => {
  const m = getMember(team, userId);
  return !!m && (m.role || '').toLowerCase().includes('junior');
};

export const isSeniorAgent = (team, userId) => {
  const m = getMember(team, userId);
  if (!m) return false;
  const r = (m.role || '').toLowerCase();
  return r.includes('senior') || (r.includes('agent') && !r.includes('junior'));
};

export const isAdmin = (team, userId) => getRoleType(team, userId) === 'admin';
export const isDriver = (team, userId) => getRoleType(team, userId) === 'driver';

// ─── PERMESSI SUI TASK ───────────────────────────────────────────────────────

export const canViewTask = (team, task, userId) => {
  const role = getRoleType(team, userId);
  if (role === 'admin') return true;
  if (role === 'driver') return isMyTask(task, userId);
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  if (isUrgent(task)) return true;
  return false;
};

export const canEditTask = (team, task, userId) => {
  const role = getRoleType(team, userId);
  if (role === 'admin') return true;
  if (role === 'driver') {
    return task.category === 'transfer' && (isMyTask(task, userId) || isInGlobalQueue(task));
  }
  // Junior Agent: può modificare solo task in cui è esplicitamente assegnato.
  // Non può "raccogliere" task dalla coda globale non assegnata.
  if (isJuniorAgent(team, userId)) return isMyTask(task, userId);
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  return false;
};

export const canCreateTaskCategory = (team, category, userId) => {
  const role = getRoleType(team, userId);
  if (role === 'admin') return true;
  if (role === 'driver') return category === 'transfer';
  // Junior Agent: non può creare task nelle categorie sensibili payment e admin.
  if (isJuniorAgent(team, userId)) return !['payment', 'admin'].includes(category);
  return true;
};

export const canAccessAdmin = (team, userId) => isAdmin(team, userId);

export const getVisibleTasks = (team, tasks, userId) =>
  (tasks || []).filter(t => canViewTask(team, t, userId));

// ─── CATEGORIE DISPONIBILI ───────────────────────────────────────────────────
// Il Driver opera solo su "transfer": gli altri ruoli vedono l'intero
// dizionario. `categories` è esplicito per la stessa ragione del team.
export const getAvailableCategories = (categories, team, userId) => {
  if (isDriver(team, userId)) return { transfer: (categories || {}).transfer };
  return categories || {};
};
