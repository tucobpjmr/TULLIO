// src/state/reducer.js
//   - baseReducer        → transizioni dello state
//   - reducer            → wrapper: pre-check admin, log, toast, selectedTask
//   - makeInitialState   → initial state (reale o demo)
//
// ⚠️ REDUCER PURO: niente effetti né scritture fuori dallo state (React può
// eseguirlo due volte). I permessi arrivano da lib/permissions.js con
// `state.team`: si decide sulla stessa fonte che React renderizza.

import { STATUS_LABELS, toDbRole, toSeniority, roleLabel } from "../lib/taskConstants.js";
import {
  getMember, isAdmin,
  canViewTask, canEditTask, canCreateTaskCategory,
  canEditClient, canDeleteClient,
} from "../lib/permissions.js";
// I guard per vista sono una tabella (visteRiservate.js).
import { dinegoVista } from "./visteRiservate.js";
// Il log attività ha un file suo: è il dizionario che racconta le transizioni.
import { LOGGED_ACTIONS, buildLogEntry } from "./activityLog.js";
// La politica della coda dei toast ha un file suo (toastQueue.js).
import { pushToast, marcaToast, ritiraToast } from "./toastQueue.js";
import { applyRestoreBackupRollback } from "./restoreBackupRollback.js";
import { fondiScrittureInVolo, applicaRigaRealtime, fondiThreadCommenti } from "./pendingWrites.js";
import { campiPrima } from "./campiPrima.js";
// Due fette con reducer proprio: il criterio sta in cima a noticesReducer.js.
import { noticesReducer } from "./noticesReducer.js";
import { messageTemplatesReducer } from "./messageTemplatesReducer.js";
import { INITIAL_CATEGORIES } from "./taskCategories.js";
import { demoState } from "./demoState.js";
import { chiaveCliente } from "../lib/chiaveCliente.js";

// Utente di default in modalità demo (nessun login, dati mock).
const DEMO_CURRENT_USER = "marco";

// completedAt coerente lato app (UI ottimistica e demo). Sul DB lo decide il
// trigger set_task_completed_at. Ritorna un patch ({ completedAt } o {}).
const completedAtPatch = (prevStatus, nextStatus) => {
  if (nextStatus === undefined || nextStatus === prevStatus) return {};
  if (nextStatus === "done") return { completedAt: new Date().toISOString() };
  return { completedAt: null };
};

// Le due richieste di navigazione: `listeTarget` e `dashboardQueue` portano un
// `seq`, che fa scattare l'effetto anche quando si chiede lo stesso valore.
// I tipi stanno qui, accanto a chi li costruisce.
/** @typedef {{ id: string, seq: number }} RichiestaLista */
/** @typedef {{ tab: string, seq: number }} RichiestaCoda */

function baseReducer(state, action) {
  // Le fette con reducer proprio rispondono `null` a ciò che non possiedono:
  // la delega non cambia l'esito degli altri case.
  const fetta = noticesReducer(state, action) ?? messageTemplatesReducer(state, action);
  if (fetta) return fetta;

  const uid = state.currentUserId;
  const _denied = (msg = "Non hai i permessi per questa azione") =>
    ({ ...state, toasts: pushToast(state.toasts, { message: msg, type: "error" }) });

  switch (action.type) {
    case "SET_VIEW": {
      // Le viste riservate sono una TABELLA (state/visteRiservate.js).
      const diniego = dinegoVista(action.payload, state.team, uid);
      if (diniego) return _denied(diniego);
      const next = { ...state, activeView: action.payload };
      // action.lista: apertura mirata di una lista dalla scheda cliente; il seq la
      // fa scattare anche sulla stessa lista due volte di fila.
      if (action.payload === "liste") {
        next.listeTarget = action.lista
          ? { id: action.lista, seq: (state.listeTarget?.seq ?? 0) + 1 }
          : null;
      }
      // action.queue: Dashboard aperta su una tab coda (il digest queue_stale punta
      // a "global"); il seq come sopra.
      if (action.queue) {
        next.dashboardQueue = { tab: action.queue, seq: (state.dashboardQueue?.seq ?? 0) + 1 };
      }
      return next;
    }
    case "CLEAR_LISTE_TARGET": {
      // Tornando all'elenco l'apertura mirata è consumata: rientrando non si riapre.
      if (!state.listeTarget) return state;
      return { ...state, listeTarget: null };
    }
    case "SET_SELECTED_TASK": {
      // Non permettere di aprire un task non visibile
      if (action.payload && !canViewTask(state.team, action.payload, uid)) {
        return _denied("Non hai i permessi per visualizzare questa task");
      }
      return { ...state, selectedTask: action.payload };
    }
    case "SET_CURRENT_USER": {
      // Cambio-utente DEMO: cambia solo `currentUserId` lato client (auth.uid()
      // resta quello vero). ⛔ In produzione il case sparisce dal bundle
      // (`import.meta.env.DEV` è `false` a build time). Sotto Vitest è `true`.
      if (!import.meta.env.DEV) return state;
      const newId = action.payload;
      const m = getMember(state.team, newId);
      if (!m) return state;
      // Se l'utente non può più stare sulla vista, si torna alla dashboard. Stessa
      // tabella di SET_VIEW: «liste» non ha voce di menu, e un Driver ci resterebbe
      // bloccato.
      const viewLocked = dinegoVista(state.activeView, state.team, newId) !== null;
      const activeView = viewLocked ? "dashboard" : state.activeView;
      // Avviso visibile quando si passa a un ruolo admin (sessione lasciata aperta).
      const elevated = isAdmin(state.team, newId);
      // Passando ad admin si registra da chi si arriva: il banner riporta indietro
      // dopo 60 s. Si azzera tornando a un non-admin.
      const prevIsAdmin = isAdmin(state.team, state.currentUserId);
      const adminRollbackTo = elevated && !prevIsAdmin ? state.currentUserId : null;
      const adminSwitchedAt = elevated && !prevIsAdmin ? new Date().toISOString() : null;
      const toasts = elevated
        ? pushToast(state.toasts, { message: `⚠️ Ora stai usando l'app come ${m.name} (Admin). Rollback automatico in 60s.`, type: "warning" })
        : pushToast(state.toasts, { message: `Ora stai usando l'app come ${m.name} (${roleLabel(m)})`, type: "success" });
      return {
        ...state,
        currentUserId: newId,
        activeView,
        // Vista riportata alla dashboard: l'apertura mirata non ha più dove andare.
        listeTarget: viewLocked ? null : state.listeTarget,
        selectedTask: null,
        toasts,
        adminRollbackTo,
        adminSwitchedAt,
      };
    }
    case "CANCEL_ADMIN_ROLLBACK": {
      return { ...state, adminRollbackTo: null, adminSwitchedAt: null };
    }
    // ─── SCRITTURE IN VOLO ───
    // Id con una scrittura partita e non conclusa: li marca e smarca
    // useSyncedDispatch attorno a spec.persist() (da `entityId`).
    // ⚠️ Una Map id → contatore, non un Set: due scritture ravvicinate sulla
    // stessa riga non devono smarcarsi a vicenda.
    case "MARK_PENDING_WRITE":
    case "UNMARK_PENDING_WRITE": {
      const ids = [].concat(action.payload ?? []).filter(Boolean);
      if (!ids.length) return state;
      const delta = action.type === "MARK_PENDING_WRITE" ? 1 : -1;
      const pendingWrites = new Map(state.pendingWrites);
      for (const id of ids) {
        const n = (pendingWrites.get(id) ?? 0) + delta;
        if (n > 0) pendingWrites.set(id, n); else pendingWrites.delete(id);
      }
      return { ...state, pendingWrites };
    }
    case "SET_TASKS": {
      // Sostituisce l'array (idratazione e refetch), ma per un id con scrittura in
      // volo vince SEMPRE la riga locale, anche se localmente non esiste più o sul
      // server non esiste ancora: l'eco della nostra scrittura viene scartata,
      // quindi nessuno correggerebbe il valore vecchio. La fusione vive in
      // state/pendingWrites.js, la stessa per clienti, avvisi e team.
      return { ...state, tasks: fondiScrittureInVolo(action.payload, state.tasks, state.pendingWrites) };
    }
    case "SET_TASK_THREADS": {
      // Idratazione parziale dei soli commenti, quando l'evento viene da `comments`.
      // La cronologia non è più un campo del task (la legge TaskHistoryPanel).
      const { comments } = action.payload || {};
      if (!comments) return state;
      // Protezione sulle scritture in volo: vedi fondiThreadCommenti.
      return { ...state, tasks: fondiThreadCommenti(state.tasks, state.pendingWrites, comments) };
    }
    // A-1 · Fonde i thread di ALCUNI task (ramo `soloThread` di useAppHydration).
    // Le chiavi assenti restano intatte: vedi fondiThreadCommenti.
    case "MERGE_TASK_COMMENTS": {
      const { taskIds, comments } = action.payload || {};
      if (!taskIds?.length || !comments) return state;
      return { ...state, tasks: fondiThreadCommenti(state.tasks, state.pendingWrites, comments, taskIds) };
    }
    // Gemello per riga di SET_TASKS (vedi applicaRigaRealtime). `comments` non è
    // una colonna di `tasks`: si preservano quelli in stato.
    case "MERGE_TASK_ROW": {
      const fondiTask = (prev, row) => ({ ...row, comments: prev.comments });
      return { ...state, tasks: applicaRigaRealtime(state.tasks, state.pendingWrites, action.payload, fondiTask) };
    }
    case "MOVE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload.taskId);
      if (!prev) return state;
      if (!canEditTask(state.team, prev, uid)) return _denied();
      const prevStatus = prev?.status;
      const tasks = state.tasks.map(t =>
        t.id === action.payload.taskId
          ? { ...t, status: action.payload.newStatus, ...completedAtPatch(t.status, action.payload.newStatus) }
          : t
      );
      const toasts = action.swipe
        ? pushToast(state.toasts, { message: `✓ Spostato in "${STATUS_LABELS[action.payload.newStatus]}"`, type: "success", undoable: true })
        : pushToast(state.toasts, { message: `Task spostato in "${STATUS_LABELS[action.payload.newStatus]}"`, type: "success" });
      const lastAction = action.swipe
        ? { type: "MOVE_TASK", taskId: action.payload.taskId, prevStatus, newStatus: action.payload.newStatus }
        : state.lastAction;
      return { ...state, tasks, toasts, lastAction };
    }
    case "ADD_TASK": {
      if (!canCreateTaskCategory(state.team, action.payload.category, uid)) {
        return _denied("Non puoi creare task di questa categoria");
      }
      const tasks = [action.payload, ...state.tasks];
      return { ...state, tasks, toasts: pushToast(state.toasts, { message: "Task creato con successo!", type: "success" }) };
    }
    case "ADD_TASKS_BULK": {
      const bad = action.payload.find(t => !canCreateTaskCategory(state.team, t.category, uid));
      if (bad) return _denied("Alcune task hanno categorie che non puoi creare");
      const tasks = [...action.payload, ...state.tasks];
      return { ...state, tasks, toasts: pushToast(state.toasts, { message: `${action.payload.length} task creati!`, type: "success" }) };
    }
    // Annulla l'inserimento ottimistico di ADD_TASKS_BULK (l'insert è atomica).
    // Nessun toast: quello d'errore lo mostra fail() in useSyncedDispatch.
    case "ROLLBACK_TASKS_BULK": {
      const ids = new Set(action.payload || []);
      if (!ids.size) return state;
      return { ...state, tasks: state.tasks.filter(t => !ids.has(t.id)) };
    }
    case "UPDATE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload.id);
      if (!prev) return state;
      if (!canEditTask(state.team, prev, uid)) return _denied();
      const statusPatch = "status" in action.payload
        ? completedAtPatch(prev.status, action.payload.status)
        : {};
      const tasks = state.tasks.map(t => t.id === action.payload.id ? { ...t, ...action.payload, ...statusPatch } : t);
      // Il pannello aperto lo riallinea il wrapper (conSelezionatoAllineato).
      // B-6 · `daCampo`: la conferma è «Salvato ✓» accanto al campo, non un toast.
      const toasts = action.swipe
        ? pushToast(state.toasts, { message: action.toastMessage || "Task aggiornato!", type: "success", undoable: true })
        : action.daCampo ? state.toasts : pushToast(state.toasts, { message: "Task aggiornato!", type: "success" });
      const { id: _id, ...valoriSwipe } = action.payload; // M-1: vedi campiPrima
      const lastAction = action.swipe && prev
        ? { type: "UPDATE_TASK", taskId: action.payload.id, prevSnapshot: campiPrima(prev, valoriSwipe), valoriSwipe }
        : state.lastAction;
      return { ...state, tasks, toasts, lastAction };
    }
    case "ADD_COMMENT": {
      const prev = state.tasks.find(t => t.id === action.payload.taskId);
      if (!prev) return state;
      if (!canViewTask(state.team, prev, uid)) return _denied("Non puoi commentare questa task");
      const tasks = state.tasks.map(t =>
        t.id === action.payload.taskId
          ? { ...t, comments: [...(t.comments || []), action.payload.comment] }
          : t
      );
      return { ...state, tasks };
    }
    // Compensazione di ADD_COMMENT: toglie il commento ottimistico per id LOCALE
    // (vedi il rollback in state/persistence.js). Nessun toast.
    case "ROLLBACK_COMMENT": {
      const { taskId, commentId } = action.payload || {};
      if (!taskId || !commentId) return state;
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === taskId
            ? { ...t, comments: (t.comments || []).filter(c => c.id !== commentId) }
            : t),
      };
    }
    case "DELETE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload);
      if (!prev) return state;
      if (!canEditTask(state.team, prev, uid)) return _denied();
      const tasks = state.tasks.map(t =>
        t.id === action.payload ? { ...t, deletedAt: new Date().toISOString() } : t
      );
      const selectedTask = state.selectedTask?.id === action.payload ? null : state.selectedTask;
      const toasts = action.swipe
        ? pushToast(state.toasts, { message: "🗑️ Spostato nel cestino", type: "success", undoable: true })
        : pushToast(state.toasts, { message: "Task spostato nel cestino", type: "success" });
      const lastAction = action.swipe
        ? { type: "DELETE_TASK", taskId: action.payload }
        : state.lastAction;
      return { ...state, tasks, selectedTask, toasts, lastAction };
    }
    case "RESTORE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload);
      if (!prev) return state;
      // Ogni utente può ripristinare solo i task che potrebbe modificare (prerogativa di status)
      if (!canEditTask(state.team, prev, uid)) return _denied("Non puoi gestire questo task nel cestino");
      const tasks = state.tasks.map(t =>
        t.id === action.payload ? { ...t, deletedAt: null } : t
      );
      return { ...state, tasks, toasts: pushToast(state.toasts, { message: "Task ripristinato!", type: "success" }) };
    }
    case "PURGE_TASK": {
      const prev = state.tasks.find(t => t.id === action.payload);
      if (!prev) return state;
      if (!canEditTask(state.team, prev, uid)) return _denied("Non puoi eliminare questo task");
      const tasks = state.tasks.filter(t => t.id !== action.payload);
      return { ...state, tasks, toasts: pushToast(state.toasts, { message: "Task eliminato definitivamente", type: "success" }) };
    }
    case "EMPTY_TRASH": {
      // Svuota solo i task cestinati che l'utente corrente può gestire
      const purgeIds = new Set(
        state.tasks.filter(t => t.deletedAt && canEditTask(state.team, t, uid)).map(t => t.id)
      );
      const count = purgeIds.size;
      const tasks = state.tasks.filter(t => !purgeIds.has(t.id));
      return { ...state, tasks, toasts: pushToast(state.toasts, { message: `Cestino svuotato (${count} task eliminati)`, type: "success" }) };
    }
    // Compensazione di EMPTY_TRASH (M-4): rimette i task che il server NON ha
    // eliminato (la purge va a blocchi: quali, lo decide il rollback in
    // state/persistence.js). Arrivano come oggetti interi dallo stato
    // pre-dispatch: la purge non ha un inverso da cui rileggerli. Nessun
    // toast: quello d'errore lo mostra già fail() in useSyncedDispatch.
    case "ROLLBACK_EMPTY_TRASH": {
      const presenti = new Set(state.tasks.map(t => t.id));
      const tornati = (action.payload || []).filter(t => t?.id && !presenti.has(t.id));
      if (!tornati.length) return state;
      return { ...state, tasks: [...state.tasks, ...tornati] };
    }

    // ─── ADMIN: TEAM ───
    // SET_TEAM: rimpiazza il team (idratazione o realtime), senza toast.
    // A-3 · Come SET_TASKS, protegge le righe con una scrittura in volo: qui una
    // riga riportata indietro è una revoca che si annulla da sola, perché
    // `state.team` decide i permessi lato client.
    // ⚠️ Serve anche `entityId` sulle entry del team (state/persistence.js): il
    // contratto fra le due metà è in src/test/realtime/scrittureInVoloContract.test.js.
    case "SET_TEAM": {
      return { ...state, team: fondiScrittureInVolo(action.payload, state.team, state.pendingWrites) };
    }
    case "ADD_TEAM_MEMBER": {
      const team = [...state.team, action.payload];
      return { ...state, team, toasts: pushToast(state.toasts, { message: `Agente "${action.payload.name}" aggiunto`, type: "success" }) };
    }
    case "UPDATE_TEAM_MEMBER": {
      // Gli stessi rifiuti del guard in state/persistence.js: quando il guard nega,
      // useSyncedDispatch dispatcha comunque e tocca al reducer respingere.
      const nextRole = toDbRole(action.payload?.role);
      if (!nextRole) return _denied("Ruolo non valido");
      if (action.payload?.id === uid && nextRole !== 'admin') {
        return _denied("Non puoi rimuovere a te stesso i permessi di amministratore");
      }
      const patch = { ...action.payload, role: nextRole, seniority: toSeniority(action.payload) };
      const team = state.team.map(m => m.id === patch.id ? { ...m, ...patch } : m);
      return { ...state, team, toasts: pushToast(state.toasts, { message: "Agente aggiornato", type: "success" }) };
    }
    case "APPROVE_TEAM_MEMBER": {
      // C-1 · `payload` è `{ id, role }`: l'ottimistico usa il ruolo che
      // UsersAPI.approve scrive, non quello scelto dal registrante.
      const { id, role } = action.payload;
      const team = state.team.map(m => m.id === id ? { ...m, pending: false, active: true, role } : m);
      return { ...state, team, toasts: pushToast(state.toasts, { message: "Agente approvato e attivato!", type: "success" }) };
    }
    case "TOGGLE_TEAM_MEMBER_ACTIVE": {
      // Stesso rifiuto del guard: senza, l'admin si vedrebbe «disattivato» con la
      // sessione ancora valida.
      if (action.payload === uid) {
        return _denied("Non puoi disattivare te stesso: chiedi a un altro admin");
      }
      const team = state.team.map(m => m.id === action.payload ? { ...m, active: !m.active } : m);
      const target = team.find(m => m.id === action.payload);
      return { ...state, team, toasts: pushToast(state.toasts, { message: target?.active ? "Agente attivato" : "Agente disattivato", type: "success" }) };
    }
    case "REMOVE_TEAM_MEMBER": {
      // Non rimuove davvero se ha task assegnati: si limita a disattivare e segnare pending=false
      const team = state.team.filter(m => m.id !== action.payload);
      return { ...state, team, toasts: pushToast(state.toasts, { message: "Agente rimosso", type: "success" }) };
    }

    // ─── ADMIN: CATEGORIES ───
    case "ADD_CATEGORY": {
      const { key, ...rest } = action.payload;
      const categories = { ...state.categories, [key]: rest };
      return { ...state, categories, toasts: pushToast(state.toasts, { message: `Categoria "${rest.label}" aggiunta`, type: "success" }) };
    }
    case "UPDATE_CATEGORY": {
      const { key, ...rest } = action.payload;
      const categories = { ...state.categories, [key]: { ...state.categories[key], ...rest } };
      return { ...state, categories, toasts: pushToast(state.toasts, { message: "Categoria aggiornata", type: "success" }) };
    }
    case "REMOVE_CATEGORY": {
      const { [action.payload]: _, ...rest } = state.categories;
      return { ...state, categories: rest, toasts: pushToast(state.toasts, { message: "Categoria rimossa", type: "success" }) };
    }
    // SET_CATEGORIES: rimpiazza il dizionario (idratazione), senza toast.
    case "SET_CATEGORIES": {
      const categories = action.payload && typeof action.payload === "object" ? action.payload : {};
      return { ...state, categories };
    }

    // ─── ADMIN: AGENZIA & BACKUP ───
    case "SET_AGENCY_NAME": {
      return { ...state, agencyName: action.payload };
    }
    case "RESTORE_BACKUP": {
      const { tasks, team, categories, agencyName, notices } = action.payload;
      // Merge (upsert) NON distruttivo, come il sync su DB: un restore che cancella
      // i record assenti dal backup sarebbe una perdita dati silenziosa.
      const mergeById = (existing, incoming) => {
        if (!Array.isArray(incoming)) return existing;
        const byId = new Map((existing || []).map(x => [x.id, x]));
        for (const item of incoming) byId.set(item.id, { ...byId.get(item.id), ...item });
        return [...byId.values()];
      };
      const nextTasks = mergeById(state.tasks, tasks);
      const nextNotices = mergeById(state.notices, notices);
      const nextTeam = mergeById(state.team, team);
      const nextCategories = (categories && typeof categories === "object" && !Array.isArray(categories))
        ? { ...state.categories, ...categories }
        : state.categories;
      return {
        ...state,
        tasks: nextTasks,
        team: nextTeam,
        categories: nextCategories,
        agencyName: agencyName ?? state.agencyName,
        notices: nextNotices,
        toasts: pushToast(state.toasts, { message: "Backup ripristinato: dati uniti a quelli esistenti", type: "success" })
      };
    }
    // M-1 · Compensa SOLO le righe che RESTORE_BACKUP non ha scritto (calcolo in
    // restoreBackupRollback.js). Nessun toast.
    case "ROLLBACK_RESTORE_BACKUP":
      return applyRestoreBackupRollback(state, action.payload);
    case "CLEAR_ACTIVITY_LOG": {
      return { ...state, activityLog: [], toasts: pushToast(state.toasts, { message: "Log attività svuotato", type: "success" }) };
    }

    // ─── CRM: CLIENTI ───
    // `clients` è in realtime: un refetch può arrivare durante una nostra
    // scrittura, quindi la stessa fusione di SET_TASKS.
    case "SET_CLIENTS":
      return { ...state, clients: fondiScrittureInVolo(action.payload, state.clients, state.pendingWrites) };
    // Gemello di MERGE_NOTICE_ROW per l'anagrafica.
    case "MERGE_CLIENT_ROW":
      return { ...state, clients: applicaRigaRealtime(state.clients, state.pendingWrites, action.payload) };
    // A-1 · Il guard del registry blocca la rete, non il dispatch: è il reducer a
    // dover rifiutare davvero.
    case "ADD_CLIENT":
      if (!canEditClient(state.team, uid)) return _denied("Non hai i permessi per aggiungere un cliente");
      return { ...state, clients: [action.payload, ...(state.clients || [])], toasts: pushToast(state.toasts, { message: "Cliente aggiunto!", type: "success" }) };
    case "ADD_CLIENTS_BULK": {
      // M-1 · Stesso gate di ADD_CLIENT.
      if (!canEditClient(state.team, uid)) return _denied("Non hai i permessi per importare clienti");
      const n = action.payload.length;
      const clients = [...action.payload, ...(state.clients || [])];
      return { ...state, clients, toasts: pushToast(state.toasts, { message: `${n} client${n === 1 ? "e" : "i"} importat${n === 1 ? "o" : "i"}!`, type: "success" }) };
    }
    case "UPDATE_CLIENT": {
      if (!canEditClient(state.team, uid)) return _denied("Non hai i permessi per modificare questo cliente");
      const clients = (state.clients || []).map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c);
      return { ...state, clients, toasts: pushToast(state.toasts, { message: "Cliente aggiornato!", type: "success" }) };
    }
    case "DELETE_CLIENT": {
      if (!canDeleteClient(state.team, uid)) return _denied("Solo Admin e Manager possono rimuovere un cliente");
      const clients = (state.clients || []).filter(c => c.id !== action.payload);
      return { ...state, clients, toasts: pushToast(state.toasts, { message: "Cliente rimosso", type: "success" }) };
    }
    // Rinomina il cliente nei task che lo citano: `task.client` è testo libero, e
    // senza questo la scheda cliente smetterebbe di mostrarli. Solo i task che
    // l'utente può modificare; confronto sulla chiave normalizzata.
    case "RENAME_CLIENT_IN_TASKS": {
      const { from, to } = action.payload || {};
      const k = chiaveCliente(from);
      if (!k || !to || chiaveCliente(to) === k) return state;
      let n = 0;
      const tasks = (state.tasks || []).map(t => {
        if (chiaveCliente(t.client) !== k || !canEditTask(state.team, t, uid)) return t;
        n += 1;
        return { ...t, client: to };
      });
      if (!n) return state;
      // Il pannello aperto lo riallinea il wrapper: se il task è stato saltato per
      // permessi, la riga è quella di prima.
      return {
        ...state, tasks,
        toasts: pushToast(state.toasts, { message: `${n} task aggiornat${n === 1 ? "o" : "i"} col nuovo nome cliente`, type: "success" }),
      };
    }
    // M-2 · Riporta al nome precedente i soli task il cui update non è arrivato.
    // Nessun toast.
    case "ROLLBACK_RENAME_CLIENT_IN_TASKS": {
      const { ids, from } = action.payload || {};
      const idSet = new Set(ids || []);
      if (!idSet.size) return state;
      const tasks = (state.tasks || []).map(t => (idSet.has(t.id) ? { ...t, client: from } : t));
      return { ...state, tasks };
    }
    // Riporta in lista un cliente la cui DELETE_CLIENT è stata respinta dal DB.
    case "RESTORE_CLIENT": {
      if (!action.payload || (state.clients || []).some(c => c.id === action.payload.id)) return state;
      return { ...state, clients: [...(state.clients || []), action.payload] };
    }
    // Annulla ADD_CLIENTS_BULK per i soli clienti non arrivati (`res.scritti`
    // blocchi sono già scritti e restano). Nessun toast.
    case "ROLLBACK_CLIENTS_BULK": {
      const ids = new Set(action.payload || []);
      if (!ids.size) return state;
      return { ...state, clients: (state.clients || []).filter(c => !ids.has(c.id)) };
    }

    case "SHOW_TOAST": return { ...state, toasts: pushToast(state.toasts, { message: action.payload?.message ?? "", type: action.payload?.type ?? "error", undoable: !!action.payload?.undoable }) };
    case "CLEAR_TOAST": return { ...state, toasts: (state.toasts || []).filter(t => t.id !== action.payload) };
    // B-2 · Il percorso d'errore ritira il toast di successo che sta per essere
    // smentito (vedi state/toastQueue.js).
    case "RETRACT_TOASTS": return { ...state, toasts: ritiraToast(state.toasts, action.payload) };
    case "UNDO_LAST_ACTION": {
      const la = state.lastAction;
      if (!la) return state;
      if (la.type === "MOVE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? { ...t, status: la.prevStatus } : t);
        return { ...state, tasks, toasts: pushToast(state.toasts, { message: "Azione annullata", type: "success" }), lastAction: null };
      }
      if (la.type === "DELETE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? { ...t, deletedAt: null } : t);
        return { ...state, tasks, toasts: pushToast(state.toasts, { message: "Azione annullata", type: "success" }), lastAction: null };
      }
      if (la.type === "UPDATE_TASK") {
        const tasks = state.tasks.map(t => t.id === la.taskId ? { ...t, ...la.prevSnapshot } : t);
        return { ...state, tasks, toasts: pushToast(state.toasts, { message: "Azione annullata", type: "success" }), lastAction: null };
      }
      return state;
    }
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
      return { ...state, team, toasts: pushToast(state.toasts, { message: "Profilo aggiornato!", type: "success" }) };
    }

    default: return state;
  }
}

// ─── L'INVARIANTE DI selectedTask (A-1) ─────────────────────────────────────
// `selectedTask` è la STESSA riga che sta in `tasks`, o `null` se lì non c'è
// più. Si applica qui, nel wrapper, così vale per ogni case (anche SET_TASKS e
// MERGE_TASK_ROW, che portano ciò che è cambiato sul server): TaskSlideOver
// decide `editable` su `selectedTask`.
// ⚠️ Il guard `next.tasks === prev.tasks` è semantica, non ottimizzazione:
// senza, un SET_SELECTED_TASK su un task non ancora nell'array verrebbe
// annullato dallo stesso dispatch. DELETE_TASK azzera `selectedTask` da sé.
const conSelezionatoAllineato = (next, prev) => {
  if (next === prev || next.tasks === prev.tasks || !next.selectedTask) return next;
  const allineato = (next.tasks || []).find(t => t.id === next.selectedTask.id) ?? null;
  return allineato === next.selectedTask ? next : { ...next, selectedTask: allineato };
};

// Azioni che richiedono ruolo Admin (vedono pre-check nel wrapper sotto)
const ADMIN_ONLY_ACTIONS = new Set([
  "ADD_TEAM_MEMBER", "UPDATE_TEAM_MEMBER", "APPROVE_TEAM_MEMBER",
  "TOGGLE_TEAM_MEMBER_ACTIVE", "REMOVE_TEAM_MEMBER",
  "ADD_CATEGORY", "UPDATE_CATEGORY", "REMOVE_CATEGORY",
  "SET_AGENCY_NAME", "RESTORE_BACKUP", "CLEAR_ACTIVITY_LOG",
  "ADD_MESSAGE_TEMPLATE", "UPDATE_MESSAGE_TEMPLATE", "DELETE_MESSAGE_TEMPLATE",
]);

// Wrapper che aggiunge automaticamente al log le azioni rilevanti
function reducer(state, action) {
  // Pre-check permessi Admin (centralizzato — non sporca i singoli case)
  if (ADMIN_ONLY_ACTIONS.has(action.type) && !isAdmin(state.team, state.currentUserId)) {
    return { ...state, toasts: pushToast(state.toasts, { message: "Solo Admin può eseguire questa azione", type: "error" }) };
  }
  // B-2 · Ogni toast porta l'azione che l'ha prodotto (vedi toastQueue.js).
  // A-1 · Il task aperto resta la riga di `tasks` (conSelezionatoAllineato).
  const next = conSelezionatoAllineato(
    marcaToast(state.toasts, baseReducer(state, action), action.type),
    state,
  );

  // ─── COMPENSAZIONE (M-1) ───────────────────────────────────────────────────
  // I rollback riusano le action di mutazione, e il case accoderebbe il suo
  // toast di successo accanto all'errore. Con `meta.compensazione` (lo mette
  // l'orchestratore: è una proprietà del percorso) si tiene la transizione,
  // si riportano indietro i toast e si salta il log attività.
  if (action.meta?.compensazione) {
    return next === state ? state : { ...next, toasts: state.toasts };
  }

  if (LOGGED_ACTIONS.has(action.type) && next !== state) {
    const entry = buildLogEntry(action, state);
    const activityLog = [entry, ...(next.activityLog || [])].slice(0, 100);
    return { ...next, activityLog };
  }
  return next;
}

// Initial state: con `currentUserId` quello reale; senza, e solo in
// sviluppo, quello demo. B-1 · Un team vuoto non è la demo: è un errore, lo
// mostra AuthGate. Funzione PURA (StrictMode può eseguirla due volte).
/** @param {{team?: Array<object>, currentUserId?: string}} [iniziale] */
function makeInitialState({ team, currentUserId } = {}) {
  // Dati demo solo in sviluppo: in produzione il bundler esclude demoState() e
  // mockData.js (`import.meta.env.DEV` è `false` a build time).
  let demo = null;
  if (import.meta.env.DEV && !currentUserId) demo = demoState();
  return {
    // Fuori dalla demo le task arrivano dall'idratazione: si parte da vuoto.
    tasks: demo ? demo.tasks : [],
    // Copie: lo state non condivide riferimenti con gli array sorgente.
    team: demo ? [...demo.team] : [...(Array.isArray(team) ? team : [])],
    categories: { ...INITIAL_CATEGORIES },
    agencyName: "VoyageDesk",
    notices: demo ? demo.notices : [],
    clients: [],
    // Scritture in volo: id → quante. La gestisce useSyncedDispatch.
    pendingWrites: new Map(),
    activityLog: [],
    activeView: "dashboard",
    // Richiesta di aprire la Dashboard su una tab coda ({ tab, seq }). null = nessuna.
    dashboardQueue: null,
    // Richiesta di aprire il modulo Liste su una lista ({ id, seq }). null = elenco.
    listeTarget: null,
    selectedTask: null,
    toasts: [],
    lastAction: null, // { type, payload, undo: () => state-patch } per swipe-actions undo
    // Utente loggato; senza login, l'utente demo.
    currentUserId: currentUserId || DEMO_CURRENT_USER,
    // Impostati da SET_CURRENT_USER quando si passa ad Admin.
    adminRollbackTo: null,    // userId a cui tornare automaticamente
    adminSwitchedAt: null,    // ISO timestamp del momento in cui si è entrati come Admin
    // Template dei messaggi chat ({ id, label, text }), gestiti da Admin.
    messageTemplates: [
      { id: "mt1", label: "Conferma ricezione documenti", text: "Buongiorno, abbiamo ricevuto i documenti. Le confermeremo a breve i dettagli della pratica." },
      { id: "mt2", label: "Richiesta passaporti", text: "Buongiorno, per procedere con la prenotazione le servono i dati anagrafici completi e copia dei passaporti di tutti i partecipanti. Grazie!" },
      { id: "mt3", label: "Sollecito acconto", text: "Le ricordiamo che la scadenza per il versamento dell'acconto è imminente. Resto a disposizione per qualsiasi chiarimento." },
      { id: "mt4", label: "Voucher pronto", text: "I documenti di viaggio (voucher hotel, biglietti, assicurazione) sono pronti. Li trova in allegato o può ritirarli in agenzia." },
    ],
  };
}

export { reducer, makeInitialState, ADMIN_ONLY_ACTIONS };
