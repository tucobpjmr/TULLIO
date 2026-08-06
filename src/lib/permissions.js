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
//   - state/AppDataContext   → per i componenti, che le ricevono già legate al
//                              team del provider (useAppData)
//
// NOTA sui ruoli: `member.role` contiene i valori dell'enum del database
// (admin|manager|agent|driver, vedi DB_ROLES in lib/taskConstants.js) e il
// confronto è per UGUAGLIANZA ESATTA — lo stesso che fanno private.is_admin()
// e private.can_liste() lato DB.
//
// Prima il confronto era per sottostringa case-insensitive. Serviva a far
// classificare allo stesso modo "Senior Agent", "senior agent" e "agent", ma
// significava che una decisione di autorizzazione dipendeva da un accidente
// lessicale: un ruolo come "Amministrativo" otteneva i permessi di admin
// perché conteneva "admin". Soprattutto, dava a questo livello risposte
// diverse da quelle del database sulla stessa domanda — e il database è
// l'unico dei due che un utente non possa aggirare.
//
// Il sotto-livello Junior/Senior non sta più dentro la stringa del ruolo: è
// una colonna a parte (users.seniority), perché nell'enum DB non c'è posto.

import { isMyTask, isInGlobalQueue, isUrgent } from './taskUtils.js';
import { toDbRole, toSeniority } from './taskConstants.js';

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
  // toDbRole ritorna null per i valori fuori enum: quel membro lato database
  // non passa nessun helper di ruolo, quindi qui lo trattiamo come il profilo
  // più ristretto (agent, e junior per isJuniorAgent qui sotto) invece di
  // promuoverlo. Non è un caso teorico: era il risultato di ogni ruolo scritto
  // a mano prima che i due vocabolari venissero unificati.
  return toDbRole(m.role) ?? 'agent';
};

// Sotto-livello Agent: un junior ha permessi ridotti (solo task esplicitamente
// assegnati, niente categorie payment/admin); senior è il default.
export const isJuniorAgent = (team, userId) => {
  const m = getMember(team, userId);
  if (!m) return false;
  // Ruolo non riconosciuto → trattato come junior: è il verdetto più
  // restrittivo, e corrisponde a ciò che il DB concederebbe comunque a un
  // utente il cui role non compare in nessuno degli helper private.*.
  if (toDbRole(m.role) === null) return true;
  return getRoleType(team, userId) === 'agent' && toSeniority(m) === 'junior';
};

export const isSeniorAgent = (team, userId) => {
  const m = getMember(team, userId);
  if (!m) return false;
  return getRoleType(team, userId) === 'agent' && !isJuniorAgent(team, userId);
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

// ─── MODULO LISTE VIAGGIO ────────────────────────────────────────────────────
// Rispecchia `private.can_liste()` lato database (migrazione 20260728190100):
// role IN (admin, manager, agent) AND active.
//
// PERCHÉ ESISTE. La stessa domanda — "questo utente può usare il modulo Liste?"
// — aveva cinque risposte scritte in cinque punti: il reducer e le due viste
// del core la ponevano come `!isDriver(...)`, il modulo come
// `role === "driver"`, e il database come `can_liste()`. Sono equivalenti solo
// finché ogni membro ha un ruolo dentro l'enum ed è attivo; fuori da lì
// divergono, e a divergere è il livello che decide che cosa mostrare rispetto a
// quello che decide che cosa è permesso. È lo stesso motivo per cui `isAdmin`
// è una funzione sola e non un confronto ripetuto (vedi AuthContext).
//
// Le due differenze rispetto a `!isDriver` sono volute, ed entrambe rendono il
// verdetto più vicino a quello del database:
//   • un utente non più nel team non ottiene l'accesso per assenza di prove;
//   • un utente disattivato nemmeno — la RLS lo rifiuterebbe comunque, ma qui
//     riceve un diniego pulito invece di una vista piena di errori.
// Il confronto passa da toDbRole come ovunque: un ruolo fuori enum non
// corrisponde a nessun ramo di can_liste() e qui non deve corrispondere.
const RUOLI_LISTE = ['admin', 'manager', 'agent'];

export const canAccessListe = (team, userId) => {
  const m = getMember(team, userId);
  if (!m || m.active === false) return false;
  return RUOLI_LISTE.includes(toDbRole(m.role));
};

export const getVisibleTasks = (team, tasks, userId) =>
  (tasks || []).filter(t => canViewTask(team, t, userId));

// ─── CATEGORIE DISPONIBILI ───────────────────────────────────────────────────
// Il Driver opera solo su "transfer": gli altri ruoli vedono l'intero
// dizionario. `categories` è esplicito per la stessa ragione del team.
export const getAvailableCategories = (categories, team, userId) => {
  if (isDriver(team, userId)) return { transfer: (categories || {}).transfer };
  return categories || {};
};
