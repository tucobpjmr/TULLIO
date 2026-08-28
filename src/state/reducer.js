// src/state/reducer.js
// Reducer dello stato applicativo estratto dal monolite (Step P Phase 2d).
//
// Contiene:
//  - baseReducer                     → logica pura di transizione dello state
//  - ADMIN_ONLY_ACTIONS / reducer    → wrapper con pre-check permessi + logging
//  - makeInitialState                → factory dell'initial state (mock o DB)
//
// QUESTO REDUCER È PURO: nessun effetto collaterale, nessuna scrittura su stato
// esterno — React 18 non garantisce di eseguire un reducer una volta sola
// (StrictMode li invoca due volte, il Concurrent rendering può scartare un
// render già calcolato). I componenti leggono team/categorie/utente da
// state/AppDataContext.jsx, alimentato da questo stesso state; perché i globali
// mutabili che stavano al suo posto siano spariti lo dice VIETATO_APPGLOBALS in
// eslint.config.js, che è anche ciò che impedisce loro di tornare.
//
// I permessi arrivano da lib/permissions.js (funzioni pure) e ricevono
// `state.team`: le decisioni di autorizzazione si prendono sulla stessa fonte di
// verità che React sta renderizzando, non su una variabile di modulo.

import { STATUS_LABELS, toDbRole, toSeniority, roleLabel } from "../lib/taskConstants.js";
import {
  getMember, isAdmin,
  canAccessAdmin, canAccessListe, canViewTask, canEditTask, canCreateTaskCategory,
  canEditClient, canDeleteClient,
} from "../lib/permissions.js";
// Le voci del log attività (quali azioni ci finiscono e come si leggono) hanno
// un file loro: non sono transizioni di stato, sono il dizionario che le
// racconta. Vedi state/activityLog.js per il perché della separazione.
import { LOGGED_ACTIONS, buildLogEntry } from "./activityLog.js";
// La politica della coda dei toast (dedup, cap, marcatura, ritiro) ha un file
// suo per la stessa ragione del log attività: non sono transizioni di stato.
import { pushToast, marcaToast, ritiraToast } from "./toastQueue.js";
import { applyRestoreBackupRollback } from "./restoreBackupRollback.js";
import { fondiScrittureInVolo, applicaRigaRealtime, fondiThreadCommenti } from "./pendingWrites.js";
// Due fette di dominio hanno un reducer proprio. Il perché della scelta — e il
// criterio con cui si decide se una fetta può uscire senza spezzare la macchina
// a stati — sta in cima a state/noticesReducer.js.
import { noticesReducer } from "./noticesReducer.js";
import { messageTemplatesReducer } from "./messageTemplatesReducer.js";
import { INITIAL_CATEGORIES } from "./taskCategories.js";
import { demoState } from "./demoState.js";
import { chiaveCliente } from "../lib/chiaveCliente.js";

// Utente di default in modalità demo (nessun login, dati mock).
const DEMO_CURRENT_USER = "marco";

// Mantiene completedAt coerente lato app (UI ottimistica + modalità mock).
// Sul DB la fonte di verità è il trigger set_task_completed_at; qui replichiamo
// la stessa regola per non mostrare uno stato stantio prima del reload realtime.
// Ritorna un patch ({ completedAt } o {}) da spalmare sulla task aggiornata.
const completedAtPatch = (prevStatus, nextStatus) => {
  if (nextStatus === undefined || nextStatus === prevStatus) return {};
  if (nextStatus === "done") return { completedAt: new Date().toISOString() };
  return { completedAt: null };
};

function baseReducer(state, action) {
  // Le fette con reducer proprio rispondono `null` a ciò che non possiedono,
  // quindi questa delega non può cambiare l'esito di nessun altro case: o una
  // delle due riconosce l'azione, o si prosegue nello switch esattamente come
  // prima. Sta PRIMA dello switch e non dentro un `case` perché i tipi di
  // azione che le due gestiscono non sono più nominati qui.
  const fetta = noticesReducer(state, action) ?? messageTemplatesReducer(state, action);
  if (fetta) return fetta;

  const uid = state.currentUserId;
  const _denied = (msg = "Non hai i permessi per questa azione") =>
    ({ ...state, toasts: pushToast(state.toasts, { message: msg, type: "error" }) });

  switch (action.type) {
    case "SET_VIEW": {
      // Solo admin può aprire la vista Admin
      if (action.payload === "admin" && !canAccessAdmin(state.team, uid)) {
        return _denied("Non hai i permessi per accedere all'Admin");
      }
      // Il modulo Liste viaggio è riservato ad admin/manager/agent attivi: la
      // RLS lo blocca comunque lato DB (migrazione 20260728190100), qui
      // evitiamo di aprire una vista che mostrerebbe solo errori. Il verdetto
      // arriva da canAccessListe, che rispecchia can_liste() del database: era
      // scritto qui come `isDriver(...)`, cioè una seconda definizione della
      // stessa regola che coincideva con la prima solo per i casi ordinari.
      if (action.payload === "liste" && !canAccessListe(state.team, uid)) {
        return _denied("Il modulo Liste viaggio non è disponibile per il tuo ruolo");
      }
      const next = { ...state, activeView: action.payload };
      // action.lista: apertura mirata di una lista dal tab nella scheda
      // cliente. Il seq incrementale fa scattare l'apertura anche quando si
      // richiede due volte di fila la stessa lista (stesso meccanismo di
      // action.queue qui sotto).
      if (action.payload === "liste") {
        next.listeTarget = action.lista
          ? { id: action.lista, seq: (state.listeTarget?.seq ?? 0) + 1 }
          : null;
      }
      // action.queue: la Dashboard deve aprirsi su una tab coda precisa (il
      // digest queue_stale punta a "global"). Il seq incrementale serve a far
      // scattare la selezione anche quando la tab richiesta è la stessa
      // dell'ultima volta ma nel frattempo l'utente ne ha aperta un'altra.
      if (action.queue) {
        next.dashboardQueue = { tab: action.queue, seq: (state.dashboardQueue?.seq ?? 0) + 1 };
      }
      return next;
    }
    case "CLEAR_LISTE_TARGET": {
      // Tornando all'elenco dentro il modulo, l'apertura mirata è consumata:
      // senza azzerarla, rientrare nel modulo riaprirebbe la stessa lista.
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
      // Cambio-utente DEMO. Cambia SOLO `currentUserId` lato client, mentre
      // auth.uid() lato server resta l'utente reale: non concede quindi alcun
      // dato — le scritture fallirebbero comunque via RLS — ma monta viste
      // decise da currentUserId, Admin compresa (VoyageDesk.jsx:239 chiama
      // canAccessAdmin(state.team, state.currentUserId)).
      //
      // L'unico ingresso UI è già gate-ato in UserSwitcher.jsx:42, quindi in
      // produzione questo case è irraggiungibile. Il guard qui sotto lo fa
      // sparire dal bundle invece di limitarsi a renderlo irraggiungibile:
      // `import.meta.env.DEV` è una costante `false` a build time, quindi il
      // bundler elimina tutto ciò che segue. Stessa logica della migrazione
      // revoke_anon_table_grants — un privilegio non sfruttabile resta un
      // privilegio da non concedere.
      //
      // Sotto Vitest DEV è `true`: i test che dispatchano SET_CURRENT_USER per
      // esercitare la matrice permessi continuano a funzionare.
      if (!import.meta.env.DEV) return state;
      const newId = action.payload;
      const m = getMember(state.team, newId);
      if (!m) return state;
      // Se l'utente non può più accedere alla view corrente, riporta a dashboard.
      // "liste" ha bisogno dello stesso guard di "admin" e per un motivo in più:
      // nessuna voce di sidebar/bottom-nav punta al modulo, quindi senza questo
      // un Driver resterebbe bloccato su una vista che non può né usare né
      // abbandonare da un elemento di navigazione evidenziato.
      const viewLocked = (state.activeView === "admin" && !canAccessAdmin(state.team, newId))
        || (state.activeView === "liste" && !canAccessListe(state.team, newId));
      const activeView = viewLocked ? "dashboard" : state.activeView;
      // Sicurezza operativa (v2.8): warning visibile quando si passa a un ruolo
      // privilegiato (admin), per evitare di lasciare la sessione aperta come
      // Admin per errore. Mock UserSwitcher: senza login reale serve un cue chiaro.
      const elevated = isAdmin(state.team, newId);
      // v2.8 rollback automatico: se si passa a un utente Admin, registra da chi
      // si sta passando e il timestamp. Un banner con countdown permetterà il
      // ripristino automatico dopo 60s. Si resetta se si torna a un non-admin.
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
        // Se la vista è stata riportata a dashboard, l'eventuale apertura
        // mirata di una lista non ha più un modulo dove essere consumata.
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
    // Registro degli id che hanno una scrittura partita e non ancora conclusa.
    // Li marca e li smarca useSyncedDispatch attorno a spec.persist(), leggendo
    // `entityId` dalla entry del registry (src/state/persistence.js): qui non si
    // sa nulla né dell'entità né dell'azione che sta scrivendo.
    //
    // È una Map id → numero di scritture in volo, non un Set. Con un Set, due
    // scritture ravvicinate sullo stesso task (sposta e poi rinomina, o un campo
    // salvato mentre il precedente è ancora in viaggio) si smarcherebbero a
    // vicenda: la prima che si conclude libererebbe l'id mentre la seconda è
    // ancora in volo, riaprendo esattamente la finestra che questo registro
    // chiude. Col contatore l'id resta marcato finché l'ULTIMA si è conclusa.
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
      // Sostituisce in blocco l'array tasks (idratazione iniziale + ogni refetch
      // realtime). Il refetch è però più recente solo per le righe che NON
      // stiamo scrivendo noi in questo momento: per le altre il server può
      // ancora servire il pre-immagine, e sostituirle riporterebbe a schermo il
      // valore vecchio senza che nulla venga poi a correggerlo (l'eco della
      // nostra scrittura è taggata col nostro origin_client e viene scartata).
      //
      // Per un id con scrittura in volo vince quindi SEMPRE la riga locale —
      // compreso il caso in cui localmente non esista più (DELETE/PURGE
      // ottimistici: il server la serve ancora) o non esista ancora sul server
      // (ADD_TASK/ADD_TASKS_BULK in volo: senza questo il refetch la farebbe
      // sparire dalla lista).
      // La fusione vive in state/pendingWrites.js: la stessa invariante vale
      // per clienti e avvisi (A-1 del terzo passaggio del 14 agosto), e
      // scriverla tre volte significherebbe tre occasioni di divergere.
      return { ...state, tasks: fondiScrittureInVolo(action.payload, state.tasks, state.pendingWrites) };
    }
    case "SET_TASK_THREADS": {
      // Idratazione parziale: solo i commenti, indicizzati per task. La
      // dispatcha useAppHydration quando l'evento realtime arriva da `comments`
      // e NON da `tasks` — in quel caso i campi del task non possono essere
      // cambiati, e riscaricarli tutti (con i join sui nomi) per un commento in
      // più è sproporzionato.
      //
      // Portava anche la CRONOLOGIA, fino ad A-3 (passo 3): ora la cronologia
      // non è più un campo del task, si legge per task aperto e vive nello
      // stato locale del pannello che la mostra (TaskHistoryPanel.jsx). Il
      // ramo è stato tolto e non lasciato inerte: un case che accetta una
      // chiave che nessuno dispatcha più è una scorciatoia già pronta per
      // rimettere la cronologia nello stato globale senza accorgersene.
      const { comments } = action.payload || {};
      if (!comments) return state;
      // La protezione sulle scritture in volo, e il perché, stanno in
      // fondiThreadCommenti: qui `comments` è il CORPUS, quindi nessun elenco.
      return { ...state, tasks: fondiThreadCommenti(state.tasks, state.pendingWrites, comments) };
    }
    // A-1 dell'audit del 22 agosto. Fonde i thread di ALCUNI task, lasciando
    // intatti gli altri: la dispatcha il ramo `soloThread` di useAppHydration
    // quando l'evento realtime dice QUALI task hanno commenti nuovi, invece di
    // riscaricare l'intera tabella `comments` per applicarne una riga.
    // La semantica delle chiavi assenti — che è ciò che distingue questo case
    // da SET_TASK_THREADS — è in fondiThreadCommenti.
    case "MERGE_TASK_COMMENTS": {
      const { taskIds, comments } = action.payload || {};
      if (!taskIds?.length || !comments) return state;
      return { ...state, tasks: fondiThreadCommenti(state.tasks, state.pendingWrites, comments, taskIds) };
    }
    // Gemello "per riga" di SET_TASKS (suggerimento strategico n.1, audit del
    // 16 agosto): applica UN evento sulla tabella `tasks` invece di
    // ricaricare l'elenco — vedi applyRow in useAppHydration.js e
    // applicaRigaRealtime in pendingWrites.js per il perché e l'invariante.
    // `comments` non è una colonna di `tasks`: si preservano quelli già in
    // stato, altrimenti ogni evento li azzererebbe. La cronologia non compare
    // più qui perché non è più un campo del task (A-3, passo 3).
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
        ? { type: "MOVE_TASK", taskId: action.payload.taskId, prevStatus }
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
    // Annulla l'inserimento ottimistico di ADD_TASKS_BULK quando l'insert su
    // Supabase è fallita (l'insert in blocco è atomica: nessuna delle task
    // esiste davvero). Puramente locale e senza toast — quello d'errore lo
    // mostra già il wrapper dispatch in VoyageDesk.
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
      // Il pannello aperto lo riallinea l'invariante nel wrapper. Qui c'era lo
      // stesso spread una seconda volta, ma applicato a `state.selectedTask`
      // invece che alla riga di `tasks`: due sorgenti per lo stesso risultato,
      // che coincidevano solo finché l'istantanea del pannello era aggiornata.
      const toasts = action.swipe
        ? pushToast(state.toasts, { message: action.toastMessage || "Task aggiornato!", type: "success", undoable: true })
        : pushToast(state.toasts, { message: "Task aggiornato!", type: "success" });
      const lastAction = action.swipe && prev
        ? { type: "UPDATE_TASK", taskId: action.payload.id, prevSnapshot: prev }
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
    // Compensazione di EMPTY_TRASH (M-4): la `delete … in (…)` è atomica, quindi
    // se fallisce sul server non è stato eliminato NIENTE e i task tolti in
    // ottimistico vanno rimessi tutti. Arrivano come oggetti interi dallo stato
    // pre-dispatch (vedi state/persistence.js): la purge non ha un inverso da
    // cui rileggerli. Nessun toast, come ROLLBACK_TASKS_BULK — quello d'errore
    // lo mostra già fail() in useSyncedDispatch.
    case "ROLLBACK_EMPTY_TRASH": {
      const presenti = new Set(state.tasks.map(t => t.id));
      const tornati = (action.payload || []).filter(t => t?.id && !presenti.has(t.id));
      if (!tornati.length) return state;
      return { ...state, tasks: [...state.tasks, ...tornati] };
    }

    // ─── ADMIN: TEAM ───
    // SET_TEAM: rimpiazza l'intero team con la lista fornita (idratazione o
    // refresh realtime). I componenti lo rileggono dal provider, che riceve
    // questo stesso `state.team`: qui NON si scrive nulla fuori dallo state.
    // Niente toast: la notifica utente non
    // serve (e.g. arrivo di un nuovo signup → la notifica admin esiste già via
    // trigger DB).
    //
    // A-3 (audit del 28 agosto) · la quarta entità, e l'unica che era rimasta
    // senza. Stessa protezione di SET_TASKS/SET_CLIENTS/SET_NOTICES e per la
    // stessa ragione: il refetch è più recente per tutte le righe TRANNE quelle
    // che stiamo scrivendo noi, per cui il server può ancora servire il
    // pre-immagine — e l'eco della nostra scrittura, che sarebbe l'unica
    // correzione possibile, porta il nostro `origin_client` e viene scartata.
    //
    // Qui la posta è più alta che altrove: `state.team` è il dato da cui
    // AppDataContext costruisce `io`/`per`, cioè le decisioni di autorizzazione
    // lato client. Una riga riportata indietro non è un campo sbagliato a
    // schermo, è una disattivazione o una revoca di ruolo che si annulla da
    // sola sopra il toast verde che la dà per riuscita.
    //
    // ⚠️ Questa è UNA delle due metà: senza `entityId` sulle entry del team
    // (state/persistence.js) `pendingWrites` per gli id del team resterebbe
    // sempre vuota e questa riga non cambierebbe nulla. Il contratto fra le due
    // metà è misurato da src/test/realtime/scrittureInVoloContract.test.js.
    case "SET_TEAM": {
      return { ...state, team: fondiScrittureInVolo(action.payload, state.team, state.pendingWrites) };
    }
    case "ADD_TEAM_MEMBER": {
      const team = [...state.team, action.payload];
      return { ...state, team, toasts: pushToast(state.toasts, { message: `Agente "${action.payload.name}" aggiunto`, type: "success" }) };
    }
    case "UPDATE_TEAM_MEMBER": {
      // Gli stessi due rifiuti dichiarati nel guard di state/persistence.js.
      // Devono stare anche qui: quando il guard nega, useSyncedDispatch
      // dispatcha comunque l'azione originale ed è il reducer a doverla
      // respingere. Senza, lo stato locale accetterebbe una modifica che il
      // server non riceve — cioè di nuovo il disallineamento fra UI e database
      // che questa azione è stata sistemata per chiudere.
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
      // C-1 dell'audit del 15 agosto: `payload` è `{ id, role }`. Il ruolo
      // viaggia CON l'approvazione — l'ottimistico deve rispecchiare lo
      // stesso valore che UsersAPI.approve scrive, non lasciare il ruolo
      // esistente della riga (che per un account auto-registrato era quello
      // scelto dal registrante, non dall'admin che approva).
      const { id, role } = action.payload;
      const team = state.team.map(m => m.id === id ? { ...m, pending: false, active: true, role } : m);
      return { ...state, team, toasts: pushToast(state.toasts, { message: "Agente approvato e attivato!", type: "success" }) };
    }
    case "TOGGLE_TEAM_MEMBER_ACTIVE": {
      // Lo stesso rifiuto dichiarato nel guard di state/persistence.js. Deve
      // stare anche qui: quando il guard nega, useSyncedDispatch dispatcha
      // comunque l'azione originale ed è il reducer a doverla respingere —
      // senza, lo stato locale flipperebbe "active" mentre nessuna Edge
      // Function è mai stata chiamata, e l'admin si vedrebbe "disattivato" in
      // UI con la propria sessione ancora perfettamente valida.
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
    // SET_CATEGORIES: rimpiazza l'intero dizionario con quello idratato da DB
    // (mount + refresh realtime). Come SET_TEAM, non tocca nulla fuori dallo
    // state. Niente toast: idratazione silenziosa.
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
      // Merge (upsert) NON distruttivo, coerente col sync DB (VoyageDesk), che
      // fa solo update/create per id/chiave e NON elimina i record assenti dal
      // backup. Prima il reducer SOSTITUIVA gli array in-memory: i task non
      // presenti nel backup sparivano dall'UI per poi riapparire al primo
      // reload realtime (restavano sul DB) — incoerente e allarmante. E un
      // restore che cancella i record assenti sarebbe una perdita dati silente
      // se si ripristina un backup vecchio o parziale: la scelta è l'unione.
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
    // M-1 dell'audit del 14 agosto (secondo passaggio): compensa SOLO le
    // righe che RESTORE_BACKUP non è riuscita a scrivere sul server. Il
    // calcolo è in restoreBackupRollback.js (non una transizione di stato in
    // sé, vedi il commento lì). Nessun toast: quello d'errore lo mostra già
    // `fail()` in useSyncedDispatch, come ROLLBACK_TASKS_BULK.
    case "ROLLBACK_RESTORE_BACKUP":
      return applyRestoreBackupRollback(state, action.payload);
    case "CLEAR_ACTIVITY_LOG": {
      return { ...state, activityLog: [], toasts: pushToast(state.toasts, { message: "Log attività svuotato", type: "success" }) };
    }

    // ─── CRM: CLIENTI ───
    // `clients` è in realtime dalla 20260807215625: da allora un evento di un
    // altro utente fa ripartire ClientsAPI.list() mentre la NOSTRA scrittura è
    // ancora in volo, ed è esattamente la finestra per cui pendingWrites esiste
    // (A-1, terzo passaggio del 14 agosto).
    case "SET_CLIENTS":
      return { ...state, clients: fondiScrittureInVolo(action.payload, state.clients, state.pendingWrites) };
    // Gemello di MERGE_NOTICE_ROW per l'anagrafica: stesso motivo, nessun
    // campo da preservare oltre a quelli della riga.
    case "MERGE_CLIENT_ROW":
      return { ...state, clients: applicaRigaRealtime(state.clients, state.pendingWrites, action.payload) };
    // A-1 dell'audit del 14 agosto (secondo passaggio): stesso pattern già
    // applicato agli avvisi lo stesso giorno. Senza questi tre controlli, un
    // ruolo a cui useSyncedDispatch nega la scrittura (guard in
    // state/persistence.js) vedrebbe comunque l'azione applicata IN LOCALE —
    // il pre-check dell'orchestratore impedisce solo la richiesta di rete, non
    // il dispatch che arriva qui, ed è proprio questo reducer a dover
    // rifiutare per davvero.
    case "ADD_CLIENT":
      if (!canEditClient(state.team, uid)) return _denied("Non hai i permessi per aggiungere un cliente");
      return { ...state, clients: [action.payload, ...(state.clients || [])], toasts: pushToast(state.toasts, { message: "Cliente aggiunto!", type: "success" }) };
    case "ADD_CLIENTS_BULK": {
      // M-1 (terzo passaggio): stesso gate di ADD_CLIENT. Il guard del
      // registry impedisce la richiesta di rete, non il dispatch che arriva
      // qui — quando nega, useSyncedDispatch dispatcha comunque l'azione
      // originale ed è questo reducer a doverla respingere.
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
    // Rinomina il cliente dentro i task che lo citano. `task.client` è testo
    // libero (colonna `client_id text`, non una foreign key): senza questo,
    // rinominare l'anagrafica lascia i task agganciati al vecchio nome e la
    // scheda cliente smette di mostrarli, in silenzio.
    //
    // Rinomina solo i task che l'utente può modificare: sugli altri la
    // scrittura verrebbe comunque respinta dalla RLS, e mostrarli come
    // aggiornati sarebbe una bugia. Il confronto è sulla chiave normalizzata
    // (maiuscole/accenti/spazi doppi), come ovunque si confrontino i nomi.
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
      // Il pannello aperto lo riallinea l'invariante nel wrapper, e con essa
      // sparisce anche il controllo `rinominato.client === to` che stava qui:
      // serviva a non applicare al pannello un rename che il task saltato per
      // permessi non aveva ricevuto. Riprendendo la riga da `tasks` la
      // distinzione non è più necessaria — se il task è stato saltato, la riga
      // è quella di prima.
      return {
        ...state, tasks,
        toasts: pushToast(state.toasts, { message: `${n} task aggiornat${n === 1 ? "o" : "i"} col nuovo nome cliente`, type: "success" }),
      };
    }
    // M-2 dell'audit del 14 agosto (secondo passaggio): riporta al nome
    // PRECEDENTE (`from`) i soli task il cui update non è arrivato sul
    // server — gli altri restano rinominati, perché sul server lo sono
    // davvero. Nessun toast: quello d'errore lo mostra già `fail()`.
    case "ROLLBACK_RENAME_CLIENT_IN_TASKS": {
      const { ids, from } = action.payload || {};
      const idSet = new Set(ids || []);
      if (!idSet.size) return state;
      const tasks = (state.tasks || []).map(t => (idSet.has(t.id) ? { ...t, client: from } : t));
      return { ...state, tasks };
    }
    // Riporta in lista un cliente la cui DELETE_CLIENT ottimistica è stata
    // respinta dal DB (es. foreign key su liste_viaggio): senza questo la UI
    // resta disallineata dal DB finché non arriva un reload/refetch completo.
    case "RESTORE_CLIENT": {
      if (!action.payload || (state.clients || []).some(c => c.id === action.payload.id)) return state;
      return { ...state, clients: [...(state.clients || []), action.payload] };
    }
    // Annulla l'inserimento ottimistico di ADD_CLIENTS_BULK per i soli
    // clienti che NON sono arrivati sul server (A-2): un blocco fallito a
    // metà lascia `res.scritti` blocchi già scritti, che restano in lista
    // perché ci sono davvero. Puramente locale e senza toast, come
    // ROLLBACK_TASKS_BULK — quello d'errore lo mostra già fail() in
    // useSyncedDispatch.
    case "ROLLBACK_CLIENTS_BULK": {
      const ids = new Set(action.payload || []);
      if (!ids.size) return state;
      return { ...state, clients: (state.clients || []).filter(c => !ids.has(c.id)) };
    }

    case "SHOW_TOAST": return { ...state, toasts: pushToast(state.toasts, { message: action.payload?.message ?? "", type: action.payload?.type ?? "error", undoable: !!action.payload?.undoable }) };
    case "CLEAR_TOAST": return { ...state, toasts: (state.toasts || []).filter(t => t.id !== action.payload) };
    // B-2: il percorso d'errore di useSyncedDispatch ritira il toast di
    // successo che sta per essere smentito, invece di affiancargli l'errore.
    // Il perché (e la scelta di filtrare per azione) sta in state/toastQueue.js.
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
        const tasks = state.tasks.map(t => t.id === la.taskId ? la.prevSnapshot : t);
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

// ─── L'INVARIANTE DI selectedTask (A-1) ──────────────────────────────────────
// `selectedTask` è il task aperto nello slide-over. NON è una seconda copia del
// task: è la STESSA riga che sta in `tasks`, o `null` se lì non c'è più.
//
// PERCHÉ QUI E NON NEI CASE. Prima ogni case che toccava `tasks` doveva
// ricordarsi di riallineare anche il pannello: quattro lo facevano, ricopiando
// lo stesso spread, e gli altri no — fra questi le due che portano dentro ciò
// che è cambiato sul SERVER (`SET_TASKS`, `MERGE_TASK_ROW`). Applicarla nel
// wrapper vale anche per i case che verranno, senza che nessuno se ne ricordi.
//
// PERCHÉ CONTA. `TaskSlideOver` calcola `editable = canEditTask(task, uid)` su
// `selectedTask` e lo passa a `TaskAttachments`, l'unica scrittura fuori dal
// registry. I guard del registry decidono su `state.tasks`: due fonti per la
// stessa domanda, e una sola seguiva il server. Il racconto per esteso — cosa
// vedeva l'utente, e perché la RLS non bastava a renderlo innocuo — è la nota 4
// di docs/CLAUDE.md.
//
// ⚠️ IL GUARD `next.tasks === prev.tasks` NON È UN'OTTIMIZZAZIONE, è semantica:
// senza, un `SET_SELECTED_TASK` su un task che non sta ancora nell'array
// verrebbe annullato dallo stesso dispatch che lo apre. `DELETE_TASK` resta
// l'unico case che azzera `selectedTask` di suo, ed è voluto — cestinare
// chiude il dettaglio, e un `selectedTask` già `null` non ha nulla da
// riallineare.
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
  // B-2 · Ogni toast porta l'azione che l'ha prodotto, così il percorso
  // d'errore sa quale ritirare (vedi state/toastQueue.js).
  // A-1 · …e il task aperto nello slide-over resta la stessa riga che sta in
  // `tasks`, qualunque case l'abbia appena cambiata (vedi
  // `conSelezionatoAllineato` sopra).
  const next = conSelezionatoAllineato(
    marcaToast(state.toasts, baseReducer(state, action), action.type),
    state,
  );

  // ─── COMPENSAZIONE (M-1) ───────────────────────────────────────────────────
  // I rollback di useSyncedDispatch RIUSANO le action di mutazione: annullare
  // un UPDATE_OWN_PROFILE fallito significa dispatchare un altro
  // UPDATE_OWN_PROFILE con i valori di prima. Il case però non sa di essere una
  // compensazione e accoda il suo toast di successo, quindi un salvataggio
  // RIFIUTATO dal server produceva "Profilo aggiornato!" accanto a
  // "Salvataggio fallito: …" — i due messaggi restano insieme nella pila (il
  // cap è 3) e il primo è quello che l'utente crede. Stessa cosa per
  // UPDATE_TEAM_MEMBER ("Agente aggiornato") e DELETE_CLIENT (via
  // RESTORE_CLIENT, che invece è già silenzioso).
  //
  // Il flag lo mette l'orchestratore, non le entry del registry: è una
  // proprietà del PERCORSO (siamo nel ramo d'errore), non dell'azione. Qui si
  // riportano indietro i toast — la transizione di stato resta quella del case,
  // che è esattamente ciò che il rollback vuole — e si salta il log attività:
  // un annullamento tecnico non è un'azione che l'utente ha compiuto.
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

// Factory dell'initial state. Se `team` e/o `currentUserId` sono forniti (es.
// da Supabase via AuthContext) costruisce lo state reale, altrimenti quello
// demo sui mock.
//
// È una funzione PURA: React la invoca come inizializzatore di useReducer e
// può eseguirla più di una volta (StrictMode). Prima scriveva i globali di
// state/appGlobals.js via setter; quel modulo è stato eliminato e non c'è più
// nulla da allineare fuori dallo state.
/** @param {{team?: Array<object>, currentUserId?: string}} [iniziale] */
function makeInitialState({ team, currentUserId } = {}) {
  const hasRealTeam = Array.isArray(team) && team.length > 0;
  // Dati demo (team/task/avvisi fittizi): solo sviluppo e preview senza
  // login. `import.meta.env.DEV` è una costante `false` a build time, quindi
  // in produzione questo `if` non entra mai — il bundler esclude demoState()
  // e mockData.js dal bundle invece di lasciarli solo irraggiungibili
  // (stessa tecnica di SET_CURRENT_USER più sotto in questo file).
  let demo = null;
  if (import.meta.env.DEV && !hasRealTeam) demo = demoState();
  return {
    // Quando il team viene dal DB le task in-memory non hanno più assignees validi:
    // partiamo da vuoto, le task reali arriveranno dal prossimo wire-up Supabase.
    tasks: hasRealTeam ? [] : (demo?.tasks || []),
    // Spread per creare copie: lo state non deve condividere il riferimento con
    // gli array sorgente (altrimenti una mutazione esterna passerebbe inosservata
    // a React, che confronta per identità).
    team: hasRealTeam ? [...team] : (demo ? [...demo.team] : []),
    categories: { ...INITIAL_CATEGORIES },
    agencyName: "VoyageDesk",
    notices: hasRealTeam ? [] : (demo?.notices || []),
    clients: [],
    // Scritture partite e non ancora concluse: id → quante ne sono in volo.
    // Vuota all'avvio; la riempie e la svuota useSyncedDispatch attorno a
    // spec.persist(). SET_TASKS/SET_TASK_THREADS la leggono per non sovrascrivere
    // una riga con la risposta di un refetch partito prima del nostro commit.
    pendingWrites: new Map(),
    activityLog: [],
    activeView: "dashboard",
    // Richiesta di aprire la Dashboard su una tab coda precisa ({ tab, seq }),
    // usata dal digest queue_stale nel pannello notifiche. null = nessuna.
    dashboardQueue: null,
    // Richiesta di aprire il modulo Liste su una lista precisa ({ id, seq }),
    // usata dal tab "Liste viaggio" della scheda cliente. null = elenco.
    listeTarget: null,
    selectedTask: null,
    toasts: [],
    lastAction: null, // { type, payload, undo: () => state-patch } per swipe-actions undo
    // Utente loggato (con switcher in Topbar). Senza login si parte dall'utente
    // demo, coerentemente con INITIAL_TEAM.
    currentUserId: currentUserId || DEMO_CURRENT_USER,
    // v2.8 rollback automatico: impostati da SET_CURRENT_USER quando si passa ad Admin.
    adminRollbackTo: null,    // userId a cui tornare automaticamente
    adminSwitchedAt: null,    // ISO timestamp del momento in cui si è entrati come Admin
    // v2.8: template messaggi chat (gestiti da Admin tab Sistema). Array di
    // { id, label, text }. Mock iniziale con frasi ricorrenti per agenzie viaggi.
    messageTemplates: [
      { id: "mt1", label: "Conferma ricezione documenti", text: "Buongiorno, abbiamo ricevuto i documenti. Le confermeremo a breve i dettagli della pratica." },
      { id: "mt2", label: "Richiesta passaporti", text: "Buongiorno, per procedere con la prenotazione le servono i dati anagrafici completi e copia dei passaporti di tutti i partecipanti. Grazie!" },
      { id: "mt3", label: "Sollecito acconto", text: "Le ricordiamo che la scadenza per il versamento dell'acconto è imminente. Resto a disposizione per qualsiasi chiarimento." },
      { id: "mt4", label: "Voucher pronto", text: "I documenti di viaggio (voucher hotel, biglietti, assicurazione) sono pronti. Li trova in allegato o può ritirarli in agenzia." },
    ],
  };
}

export { reducer, makeInitialState, ADMIN_ONLY_ACTIONS };
