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
 * Un membro del team, come vive in `state.team`.
 *
 * Il JSDoc di questo file citava `TeamMember` da sempre senza che il tipo
 * esistesse: leggibile per una persona, invisibile a qualunque verifica —
 * esattamente il debito che B-6 (audit del 15 agosto) descrive. Ora è
 * dichiarato, e `npm run verifica:tipi` lo controlla.
 *
 * `role` è la stringa GREZZA della riga: può essere fuori enum (ruoli scritti
 * a mano prima dell'unificazione dei vocabolari), ed è la ragione per cui
 * `getRoleType` la normalizza invece di ritornarla.
 *
 * @typedef {object} TeamMember
 * @property {string} id
 * @property {string} [name]
 * @property {string} [role]
 * @property {string} [seniority]
 * @property {boolean} [active]
 * @property {boolean} [pending]
 * @property {string} [color]
 * @property {number} [capacity]
 * @property {string} [photoUrl]
 */

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

/**
 * @param {TeamMember[]} team
 * @param {string} userId
 * @returns {'admin'|'driver'|'manager'|'agent'}
 */
export const getRoleType = (team, userId) => {
  const m = getMember(team, userId);
  if (!m) return 'agent';
  // toDbRole ritorna null per i valori fuori enum: quel membro lato database
  // non passa nessun helper di ruolo, quindi qui lo trattiamo come il profilo
  // più ristretto (agent, e junior per isJuniorAgent qui sotto) invece di
  // promuoverlo. Non è un caso teorico: era il risultato di ogni ruolo scritto
  // a mano prima che i due vocabolari venissero unificati.
  // Il cast è il punto in cui la stringa grezza diventa uno dei quattro valori
  // dell'enum: `toDbRole` ritorna già solo quelli o `null`, ma la sua firma non
  // lo dichiara e senza questo il controllo di tipo non può saperlo.
  return /** @type {'admin'|'driver'|'manager'|'agent'} */ (toDbRole(m.role) ?? 'agent');
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
// Le tre differenze rispetto a `!isDriver` sono volute, e tutte rendono il
// verdetto più vicino a quello del database:
//   • un utente non più nel team non ottiene l'accesso per assenza di prove;
//   • un utente disattivato nemmeno — la RLS lo rifiuterebbe comunque, ma qui
//     riceve un diniego pulito invece di una vista piena di errori;
//   • un utente ancora pending nemmeno (M-4 dell'audit del 13 agosto).
//
// Il terzo punto era mancante fino a M-4: `private.can_liste()` è stata
// estesa il 6 agosto (migrazione 20260806130000) ad escludere anche i pending
// — coalesce(pending, false) = false, come is_active_user/is_admin/
// is_manager_or_admin/can_view_global_queue nella stessa migrazione — ma
// questa funzione non lo era mai stata aggiornata di conseguenza, e restava
// vera per un utente pending: la stessa domanda con due risposte diverse fra
// UI e database che questo file esiste per evitare (vedi il commento in
// cima). In pratica il gate resta comunque a monte (PendingScreen non monta
// l'app finché l'admin non approva), ma questa funzione deve rispecchiare
// can_liste() a prescindere da dove altro il caso sia già intercettato — è
// la stessa ragione per cui esiste come funzione a sé e non come `!isDriver`.
// Il confronto passa da toDbRole come ovunque: un ruolo fuori enum non
// corrisponde a nessun ramo di can_liste() e qui non deve corrispondere.
const RUOLI_LISTE = ['admin', 'manager', 'agent'];

export const canAccessListe = (team, userId) => {
  const m = getMember(team, userId);
  if (!m || m.active === false || m.pending) return false;
  return RUOLI_LISTE.includes(toDbRole(m.role));
};

export const getVisibleTasks = (team, tasks, userId) =>
  (tasks || []).filter(t => canViewTask(team, t, userId));

// ─── RUBRICA INTERNA ─────────────────────────────────────────────────────────
// Rispecchia la policy RLS `user_contacts_select` (20260905115909, M-7
// dell'audit del 4 settembre): il driver vede solo il proprio contatto — è
// l'unico dato del sistema su cui il suo ruolo non aveva una restrizione, e
// non per scelta, ma perché la policy che apriva la rubrica a tutto il team
// (29 giugno) è più vecchia della restrizione del ruolo driver.
export const canViewContacts = (team, userId, targetId) =>
  targetId === userId || canAccessListe(team, userId);

// ─── CATEGORIE DISPONIBILI ───────────────────────────────────────────────────
// Il Driver opera solo su "transfer": gli altri ruoli vedono l'intero
// dizionario. `categories` è esplicito per la stessa ragione del team.
export const getAvailableCategories = (categories, team, userId) => {
  if (isDriver(team, userId)) return { transfer: (categories || {}).transfer };
  return categories || {};
};

// ─── BACHECA AVVISI ──────────────────────────────────────────────────────────
// Rispecchia le policy RLS `notices_update`/`notices_delete`
// (`author_id = auth.uid() OR is_manager_or_admin()`, migrazione iniziale):
// solo l'autore, un manager o un admin possono modificare/eliminare/pinnare un
// avviso altrui. `notice.author` è il campo camelCase che i mapper (toDbNotice/
// fromDbNotice) fanno corrispondere a `author_id` — non un id diverso.
//
// PERCHÉ ESISTE (A-1 dell'audit del 14 agosto). Prima UPDATE_NOTICE/
// DELETE_NOTICE/TOGGLE_PIN_NOTICE erano le uniche mutazioni del registry di
// persistenza senza guard: la UI mostrava i tre pulsanti a chiunque, il
// reducer applicava sempre l'azione in ottimistico, e solo la RLS — che
// nessun rollback ascoltava — la rifiutava davvero. L'utente vedeva "Avviso
// rimosso dalla bacheca" e "Salvataggio fallito" sullo stesso gesto, e
// l'avviso restava sparito dalla UI fino al reload (la DELETE fallita non
// genera un evento realtime che lo riporti).
export const canEditNotice = (team, notice, userId) => {
  if (!notice || !userId) return false;
  if (notice.author === userId) return true;
  const role = getRoleType(team, userId);
  return role === 'admin' || role === 'manager';
};

// ─── CRM: ANAGRAFICA CLIENTI ─────────────────────────────────────────────────
// Rispecchia le policy RLS su public.clients — verificate lette dal database
// di produzione, non dedotte dal solo repository: `20260622213034` non
// AGGIUNGE una restrizione a un insert prima aperto, lo STRINGE — sostituisce
// il `with check (true)` che la migrazione precedente (20260621153006) aveva
// introdotto. Il risultato è che insert, select e update hanno oggi lo STESSO
// elenco di ruoli:
//   select/insert/update → admin, manager, agent (20260613092440, 20260622213034, 20260622213133)
//   delete                → admin, manager        (20260622213133)
// più la policy restrittiva `rls_active_only`, che le AND-a tutte con "utente
// attivo". Il driver è fuori da tutte e quattro per disegno: non ha accesso ai
// dati commerciali. Per questo `canEditClient` copre sia insert che update con
// la stessa lista di ruoli — non è una semplificazione, è ciò che il database
// applica davvero.
//
// PERCHÉ ESISTE (A-1 dell'audit del 14 agosto, secondo passaggio). L'anagrafica
// era l'ultima entità di dominio senza alcuna funzione qui — e senza,
// `ADD_CLIENT`/`UPDATE_CLIENT`/`DELETE_CLIENT` in state/persistence.js erano
// le uniche mutazioni del registry senza `guard`, e `components/clients/` non
// aveva un solo controllo di ruolo: i pulsanti «Modifica»/«Rimuovi» venivano
// mostrati a chiunque. Stessa classe di lacuna già chiusa sugli avvisi qui
// sopra, rimasta aperta sull'entità più grande del progetto (835 righe) e
// l'unica con PII di persone esterne al team.
//
// Sono due funzioni e non una perché il database ne ha due: unificarle
// significherebbe scegliere quale delle due policy tradire.
const RUOLI_CLIENTI_SCRITTURA = ['admin', 'manager', 'agent'];
const RUOLI_CLIENTI_ELIMINAZIONE = ['admin', 'manager'];

const clienteConsentito = (team, userId, ruoli) => {
  const m = getMember(team, userId);
  if (!m || m.active === false || m.pending) return false;
  return ruoli.includes(toDbRole(m.role));
};

export const canEditClient = (team, userId) =>
  clienteConsentito(team, userId, RUOLI_CLIENTI_SCRITTURA);
export const canDeleteClient = (team, userId) =>
  clienteConsentito(team, userId, RUOLI_CLIENTI_ELIMINAZIONE);

// ─── STRUMENTI DATI: IMPORT BACKUP ───────────────────────────────────────────
// Rispecchia public.importa_backup (M-1 dell'audit del 15 agosto, migrazione
// 20260815231000): il gate lato DB era private.can_liste() — admin, manager
// E agent — mentre l'unico ingresso in UI (AdminIOTab) è riservato ai soli
// admin. Un agent senza il pannello Admin poteva comunque chiamare la RPC a
// mano e scrivere in clients (PII di persone esterne al team), liste_viaggio,
// lista_beneficiari, movimenti_lista. Il DB ora richiede is_admin(); questa
// funzione fa la stessa domanda lato client, così i due livelli tornano ad
// accordarsi — com'è per resetTotale nello stesso registry
// (listePersistence.js).
export const canImportBackup = (team, userId) => isAdmin(team, userId);
