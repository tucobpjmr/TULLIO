// src/state/persistence.js
// Registry dichiarativo: per ogni action, come si riflette su Supabase.
//
// PERCHÉ ESISTE. Prima queste 26 regole vivevano dentro uno `switch` da 283
// righe nel wrapper `dispatch` di VoyageDesk.jsx, che mescolava cinque
// responsabilità (permessi, generazione id, mapping DTO, chiamate DB, rollback)
// e — soprattutto — RIPETEVA a mano i controlli di permesso già scritti nel
// reducer. Due switch paralleli da tenere allineati: qualsiasi divergenza non
// produce un errore di compilazione, produce dati che si scostano in silenzio
// dal database. Il commento originale su EMPTY_TRASH lo diceva esplicitamente
// ("Deve rispecchiare esattamente il filtro del reducer…").
//
// Oggi i due livelli chiamano le STESSE funzioni pure di lib/permissions.js
// sullo stesso `state.team`, e src/test/persistenceGuards.test.js verifica per
// ogni action che il verdetto del guard coincida con quello del reducer.
//
// FORMA DI UNA ENTRY (tutti i campi opzionali tranne `persist`):
//   guard(state, action, uid)      → false = azione negata: si dispatcha
//                                    comunque al reducer (che mostra il toast
//                                    di rifiuto) ma NON si scrive sul server.
//   normalize(action, state, uid)  → arricchisce il payload prima del dispatch
//                                    (es. id uuid coerente tra UI e DB).
//   persist(state, action, uid)    → l'operazione su Supabase. `state` è quello
//                                    PRE-dispatch, come nell'implementazione
//                                    originale. Può ritornare una promise, un
//                                    array di promise o { error: null } per
//                                    "niente da fare".
//   rollback(state, action)        → action da dispatchare se persist fallisce.
//   mapError(err)                  → testo utente al posto del messaggio grezzo.
//   entityId(action)               → id (o array di id) delle righe che questa
//                                    azione sta scrivendo. Serve a marcarle come
//                                    "scrittura in volo" finché persist non si è
//                                    conclusa: vedi sotto.
//
// PERCHÉ ESISTE entityId. Fra il dispatch ottimistico e il commit della scrittura
// passano centinaia di ms, e in quella finestra un evento realtime causato da un
// ALTRO utente fa ri-scaricare la lista intera (useAppHydration → SET_TASKS). Se
// la SELECT del refetch arriva al server prima che la nostra UPDATE abbia fatto
// commit, la risposta è più recente per tutte le altre righe e più VECCHIA per la
// nostra: SET_TASKS sostituisce l'array e il valore ottimistico sparisce. Quando
// poi la UPDATE committa, la sua eco realtime porta il nostro `origin_client` e
// viene scartata — quindi nessun secondo refetch viene a correggere la UI, che
// resta indietro rispetto al database finché un evento non correlato non passa di
// lì. `entityId` dichiara quali id sono in volo; il reducer li tiene fuori dalla
// sostituzione (case MARK_PENDING_WRITE / UNMARK_PENDING_WRITE e SET_TASKS).
//
// Lo dichiarano oggi le sole entry sui TASK: il registro dei pendenti è
// consultato da SET_TASKS, e dichiararlo su clienti o avvisi marcherebbe id che
// nessuno rilegge. Il meccanismo è generico — quando SET_CLIENTS/SET_NOTICES
// avranno lo stesso trattamento, basterà aggiungere il campo alle loro entry.
//
// L'orchestratore che le esegue è src/hooks/useSyncedDispatch.js.

import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Users as UsersAPI, Clients as ClientsAPI, Categories as CategoriesAPI,
  MessageTemplates as MessageTemplatesAPI,
} from "../lib/api.js";
import {
  toDbTask, toDbTaskPatch, toDbNotice, toDbNoticePatch,
  toDbClient, toDbClientPatch, toDbCategory, toDbMessageTemplate, newId, isUuid,
} from "../lib/mappers.js";
import { canEditTask, canViewTask, canCreateTaskCategory, isAdmin } from "../lib/permissions.js";
import { toDbRole, toSeniority } from "../lib/taskConstants.js";
import { chiaveNome } from "../lib/clientNotes.js";

// Risultato "nessuna operazione": stessa forma di una risposta supabase-js
// riuscita, così l'orchestratore non ha bisogno di un ramo speciale.
const NOOP = { error: null };

const findTask = (state, id) => (state.tasks || []).find(t => t.id === id);

// I task che EMPTY_TRASH deve davvero eliminare: cestinati E gestibili
// dall'utente corrente. Una definizione sola, letta da `persist` e da
// `rollback`, perché le due devono parlare esattamente dello stesso insieme —
// e perché è lo stesso filtro che il reducer applica allo state (vedi il case
// EMPTY_TRASH e src/test/persistenceGuards.test.js).
const daPurgare = (s, uid) =>
  (s.tasks || []).filter(t => t.deletedAt && canEditTask(s.team, t, uid));

// Riconosce l'errore "questa colonna non esiste" da PostgREST (PGRST204, schema
// cache) o da Postgres (42703, undefined_column). Serve a distinguere uno schema
// non ancora migrato da un errore vero, che va invece mostrato all'utente.
const isMissingColumn = (err, column) => {
  if (!err) return false;
  const code = err.code ?? '';
  if (code !== 'PGRST204' && code !== '42703') return false;
  return String(err.message ?? '').includes(column);
};

// M-5 dell'audit del 13 agosto (seconda metà, vedi il guard di
// UPDATE_TEAM_MEMBER). Il trigger `fix_users_privilege_escalation`
// (migrazione 20260613080033) ripristina in silenzio role/active/pending/
// capacity/id quando chi scrive non è admin PER IL DATABASE — nessun errore,
// la UPDATE "riesce" e basta. Il guard controlla `isAdmin` sullo state React,
// che può essere disallineato dal verdetto del database (un secondo admin ha
// appena revocato il chiamante in un'altra sessione e l'evento realtime non è
// ancora arrivato, per esempio): in quella finestra la richiesta passa il
// guard locale, il trigger la neutralizza, e senza questo confronto
// `res.error` resterebbe null — nessun rollback, nessun toast d'errore,
// "Agente aggiornato" mostrato su un ruolo che il server non ha cambiato.
// `.select().single()` in UsersAPI.updateProfile ritorna la riga DOPO il
// trigger: confrontare il ruolo tornato con quello richiesto smaschera
// esattamente questo caso. Se `data` non arriva (mock, o un client diverso
// senza `.select()`) non c'è nulla da confrontare: si lascia passare `res`
// invariato invece di far fallire un caso che non può essere verificato.
const rispecchiaRuoloScritto = (res, ruoloRichiesto) => {
  if (res?.error || !res?.data) return res;
  if (res.data.role !== ruoloRichiesto) {
    return { data: res.data, error: { message: 'la modifica è stata rifiutata dal database (permessi insufficienti)' } };
  }
  return res;
};

export const PERSISTENCE = {
  // ─── TASKS ─────────────────────────────────────────────────────────────────
  ADD_TASK: {
    guard: (s, a, uid) => canCreateTaskCategory(s.team, a.payload?.category, uid),
    normalize: (a) => ({
      ...a,
      payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() },
    }),
    // La riga inserita in ottimistico non esiste ancora per il server: senza
    // marcarla, un refetch concorrente la farebbe sparire dalla lista.
    entityId: (a) => a.payload?.id,
    persist: (s, a) => TasksAPI.create(toDbTask(a.payload)),
  },

  ADD_TASKS_BULK: {
    guard: (s, a, uid) => (a.payload || []).every(t => canCreateTaskCategory(s.team, t?.category, uid)),
    normalize: (a) => ({
      ...a,
      payload: (a.payload || []).map(t => ({ ...t, id: isUuid(t?.id) ? t.id : newId() })),
    }),
    // Un import bulk è proprio il momento in cui il traffico realtime è più
    // fitto: tutte le righe del batch restano protette fino al commit.
    entityId: (a) => (a.payload || []).map(t => t.id),
    persist: (s, a) => (a.payload.length ? TasksAPI.createMany(a.payload.map(toDbTask)) : NOOP),
    // L'insert multi-riga è atomica: se fallisce NESSUNA task è stata creata,
    // quindi le righe già aggiunte in ottimistico vanno tolte. Senza rollback
    // restavano in lista task inesistenti sul server — sparivano solo al
    // reload, dando l'impressione che il bulk "non crei davvero" nulla.
    rollback: (s, a) => ({ type: "ROLLBACK_TASKS_BULK", payload: a.payload.map(t => t.id) }),
  },

  UPDATE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.id);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload?.id,
    persist: (s, a) => TasksAPI.update(a.payload.id, toDbTaskPatch(a.payload)),
  },

  MOVE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.taskId);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload?.taskId,
    persist: (s, a) => TasksAPI.update(a.payload.taskId, { status: a.payload.newStatus }),
  },

  DELETE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload,
    persist: (s, a) => TasksAPI.softDelete(a.payload),
  },

  RESTORE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload,
    persist: (s, a) => TasksAPI.restore(a.payload),
  },

  PURGE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload,
    persist: (s, a) => TasksAPI.hardDelete(a.payload),
  },

  // Il reducer applica l'undo solo allo stato locale (state.lastAction, popolato
  // da MOVE/DELETE/UPDATE_TASK con swipe:true). Senza questa entry il toast
  // "↩ Annulla" tornava indietro solo in UI: la riga su Supabase restava nello
  // stato post-azione e ricompariva al primo reload/evento realtime.
  UNDO_LAST_ACTION: {
    persist: (s) => {
      const la = s.lastAction;
      if (la?.type === "MOVE_TASK")   return TasksAPI.update(la.taskId, { status: la.prevStatus });
      if (la?.type === "DELETE_TASK") return TasksAPI.restore(la.taskId);
      if (la?.type === "UPDATE_TASK") return TasksAPI.update(la.taskId, toDbTaskPatch(la.prevSnapshot));
      return NOOP;
    },
  },

  // Il filtro DEVE coincidere con quello del reducer: altrimenti un utente
  // non-admin, che nel proprio Cestino vede solo un sottoinsieme dei task,
  // finirebbe per farne eliminare sul DB anche di altri. Ora entrambi passano
  // per daPurgare() → canEditTask(state.team, …) e persistenceGuards.test.js lo
  // verifica.
  //
  // M-4 dell'audit del 12 agosto. Prima: `Promise.all(ids.map(hardDelete))`,
  // cioè tre round-trip per task tutti in volo insieme (180 richieste su un
  // cestino da 60), nessuna atomicità e NESSUN rollback. Un fallimento a metà
  // — RLS, rete, una riga referenziata — lasciava parte dei task eliminati sul
  // server e il cestino svuotato per intero in UI, cioè la divergenza fra
  // schermo e database che questo registry esiste per chiudere, sull'unica
  // azione dell'app che è irreversibile per definizione.
  //
  // Ora è UNA `delete … in (…)`: o cadono tutte o nessuna. È quella atomicità a
  // rendere sensato il rollback qui sotto — con la cancellazione parziale di
  // prima, rimettere in lista TUTTI i task avrebbe mostrato come presenti anche
  // quelli che sul server erano già spariti.
  EMPTY_TRASH: {
    persist: (s, a, uid) => {
      const ids = daPurgare(s, uid).map(t => t.id);
      return ids.length ? TasksAPI.hardDeleteMany(ids) : NOOP;
    },
    // `s` è lo stato PRE-dispatch: i task cestinati ci sono ancora tutti, con
    // ogni loro campo. Si rimettono quelli — non un id, l'oggetto intero —
    // perché la purge non ha un inverso sul server da cui rileggerli.
    rollback: (s) => {
      const tornati = daPurgare(s, s.currentUserId);
      return tornati.length ? { type: "ROLLBACK_EMPTY_TRASH", payload: tornati } : null;
    },
    mapError: (err) => err?.message || "cestino non svuotato",
  },

  ADD_COMMENT: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.taskId);
      return !!prev && canViewTask(s.team, prev, uid);
    },
    // Il commento è appeso al task: la riga da proteggere è quella del task,
    // altrimenti un refetch concorrente riporta il thread senza il commento
    // appena scritto.
    entityId: (a) => a.payload?.taskId,
    persist: (s, a, uid) => CommentsAPI.create({
      task_id: a.payload.taskId,
      user_id: uid,
      text: a.payload.comment?.text ?? "",
    }),
  },

  // ─── BACHECA AVVISI ────────────────────────────────────────────────────────
  ADD_NOTICE: {
    normalize: (a, s, uid) => ({
      ...a,
      payload: {
        ...a.payload,
        id: isUuid(a.payload?.id) ? a.payload.id : newId(),
        author: a.payload.author ?? uid,
      },
    }),
    persist: (s, a) => NoticesAPI.create(toDbNotice(a.payload)),
  },
  UPDATE_NOTICE: { persist: (s, a) => NoticesAPI.update(a.payload.id, toDbNoticePatch(a.payload)) },
  DELETE_NOTICE: { persist: (s, a) => NoticesAPI.remove(a.payload) },
  TOGGLE_PIN_NOTICE: {
    persist: (s, a) => {
      const prev = (s.notices || []).find(n => n.id === a.payload);
      return NoticesAPI.togglePin(a.payload, !prev?.pinned);
    },
  },

  // ─── CRM: CLIENTI ──────────────────────────────────────────────────────────
  // L'id generato qui è ora quello che finisce anche sul database (toDbClient
  // lo porta con sé): prima il DB ne assegnava uno proprio via
  // gen_random_uuid() e lo stato React conservava l'altro, rendendo
  // UPDATE_CLIENT/DELETE_CLIENT no-op fino al reload successivo.
  // `isUuid` come per i task: un id già valido non va rigenerato.
  ADD_CLIENT: {
    normalize: (a) => ({
      ...a,
      payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() },
    }),
    persist: (s, a) => ClientsAPI.create(toDbClient(a.payload)),
  },

  // A-2 dell'audit dell'11 agosto: N `create()` in Promise.all non è né
  // atomico (una riga rifiutata da vincolo/RLS/rete lascia passare le altre)
  // né compensato (nessun rollback), mentre il gemello ADD_TASKS_BULK ha
  // entrambi. Su un import che arriva a centinaia di righe per file, un
  // fallimento a metà lasciava in lista clienti che sul server non
  // esistevano — scoperto solo al reload, e con il sintomo peggiore possibile
  // su un'anagrafica: il doppione, che non si deduplica da solo.
  ADD_CLIENTS_BULK: {
    normalize: (a) => ({
      ...a,
      payload: (a.payload || []).map(c => ({ ...c, id: isUuid(c?.id) ? c.id : newId() })),
    }),
    persist: (s, a) => (a.payload.length
      ? ClientsAPI.createMany(a.payload.map(toDbClient))
      : NOOP),
    // Toglie dalla lista SOLO i clienti che non sono arrivati sul server
    // (`res.scritti` conta i blocchi già scritti prima del blocco fallito).
    // Un rollback totale sarebbe sbagliato quanto nessuno: cancellerebbe
    // dalla UI righe che sul database ci sono davvero, e l'operatore le
    // reimporterebbe creando esattamente il doppione che questa entry esiste
    // per evitare.
    rollback: (s, a, res) => {
      const daTogliere = (a.payload || []).slice(res?.scritti ?? 0).map(c => c.id);
      return daTogliere.length
        ? { type: "ROLLBACK_CLIENTS_BULK", payload: daTogliere }
        : null;
    },
    mapError: (err) => (err?.code === "23505"
      ? "alcune righe erano già presenti in anagrafica: import interrotto, i clienti già inseriti restano"
      : err?.message),
  },

  // toDbClientPatch e non toDbClient: l'id è già nella clausola WHERE, e
  // mandarlo anche fra i campi da scrivere significherebbe riscrivere la
  // chiave primaria della riga che si sta modificando.
  UPDATE_CLIENT: { persist: (s, a) => ClientsAPI.update(a.payload.id, toDbClientPatch(a.payload)) },

  // Propagazione del rename cliente sui task che lo citano per nome
  // (task.client è testo libero, non una FK). Il filtro deve essere lo STESSO
  // del reducer — chiave normalizzata + canEditTask — altrimenti UI e database
  // toccherebbero righe diverse.
  RENAME_CLIENT_IN_TASKS: {
    persist: (s, a, uid) => {
      const { from, to } = a.payload || {};
      const k = chiaveNome(from);
      if (!k || !to || chiaveNome(to) === k) return NOOP;
      const daAggiornare = (s.tasks || [])
        .filter(t => chiaveNome(t.client) === k && canEditTask(s.team, t, uid));
      if (!daAggiornare.length) return NOOP;
      return Promise.all(daAggiornare.map(t => TasksAPI.update(t.id, { client_id: to })));
    },
  },

  DELETE_CLIENT: {
    persist: (s, a) => ClientsAPI.remove(a.payload),
    rollback: (s, a) => {
      const prev = (s.clients || []).find(c => c.id === a.payload);
      return prev ? { type: "RESTORE_CLIENT", payload: prev } : null;
    },
    // 23503 = violazione foreign key (es. liste_viaggio ancora collegate al
    // cliente): il messaggio Postgres grezzo non è comprensibile per l'utente
    // finale, lo sostituiamo con uno actionable.
    mapError: (err) => (err?.code === "23503"
      ? "impossibile eliminare: il cliente ha liste viaggio collegate. Rimuovi o riassegna prima le liste viaggio associate."
      : err?.message),
  },

  // ─── ADMIN: CATEGORIE ──────────────────────────────────────────────────────
  ADD_CATEGORY: { persist: (s, a) => CategoriesAPI.create(toDbCategory(a.payload)) },
  UPDATE_CATEGORY: {
    persist: (s, a) => {
      const { key, ...rest } = a.payload;
      return CategoriesAPI.update(key, rest);
    },
  },
  REMOVE_CATEGORY: { persist: (s, a) => CategoriesAPI.remove(a.payload) },

  // ─── ADMIN: TEMPLATE MESSAGGI CHAT ─────────────────────────────────────────
  // A-1 dell'audit dell'11 agosto: prima erano solo case del reducer che
  // scrivevano state.messageTemplates — nessuna tabella, il reducer
  // rispondeva "Template aggiunto" e al reload non restava nulla (i quattro
  // di default in makeInitialState tornavano identici, il che rendeva il
  // difetto più difficile da notare). Stesso trattamento delle categorie:
  // dati di dominio letti da tutto il team, scritti solo dall'admin — il
  // guard è già coperto da ADMIN_ONLY_ACTIONS in useSyncedDispatch, come per
  // ADD_CATEGORY.
  ADD_MESSAGE_TEMPLATE: {
    normalize: (a) => ({
      ...a,
      payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() },
    }),
    persist: (s, a) => MessageTemplatesAPI.create(toDbMessageTemplate(a.payload)),
  },
  UPDATE_MESSAGE_TEMPLATE: {
    persist: (s, a) => MessageTemplatesAPI.update(a.payload.id, {
      label: a.payload.label, text: a.payload.text,
    }),
  },
  DELETE_MESSAGE_TEMPLATE: { persist: (s, a) => MessageTemplatesAPI.remove(a.payload) },

  // ─── ADMIN: TEAM ───────────────────────────────────────────────────────────
  // ADD_TEAM_MEMBER resta locale: senza email non esiste una riga auth.users da
  // aggiornare (con email il percorso è l'invito, non questa azione).
  //
  // UPDATE_TEAM_MEMBER invece DEVE essere persistito. Finché non lo era, il
  // reducer aggiornava state.team e mostrava "Agente aggiornato" mentre sul
  // database non cambiava nulla: il cambio di ruolo — cioè il modo con cui un
  // admin REVOCA i privilegi di un account compromesso o di chi cambia
  // mansione — era un no-op che la UI confermava. L'utente declassato
  // conservava is_manager_or_admin() lato DB, e l'unico segnale del problema
  // era il ruolo che tornava indietro al reload successivo.
  //
  // La motivazione storica per lasciarla locale ("richiederebbe il mapping
  // all'enum DB, niente sotto-ruolo Junior/Senior nello schema") è caduta:
  // toDbRole normalizza il valore e seniority ha una colonna sua
  // (migrazione 20260806120000).
  UPDATE_TEAM_MEMBER: {
    // M-5 dell'audit del 13 agosto: questo guard controllava solo
    // l'auto-declassamento, appoggiandosi per l'admin-check SOLO ad
    // ADMIN_ONLY_ACTIONS (state/reducer.js) e al pre-check duplicato in
    // useSyncedDispatch — mai a una verifica propria. Una entry che revoca i
    // privilegi di un account non dovrebbe dipendere per intero da un elenco
    // esterno per la sua unica vera barriera: se UPDATE_TEAM_MEMBER sparisse
    // da quell'elenco (o venisse dispatchata da un percorso che non lo
    // consulta) qui non ci sarebbe più nulla a fermarla, e il trigger DB
    // `fix_users_privilege_escalation` (20260613080033) la ripristinerebbe sì,
    // ma IN SILENZIO — vedi persist() qui sotto per la seconda metà del
    // problema.
    guard: (s, a, uid) => {
      if (!isAdmin(s.team, uid)) return false;
      const next = toDbRole(a.payload?.role);
      if (!next) return false;                 // ruolo fuori enum → non si scrive
      // Un admin non può declassare se stesso: se è l'ultimo rimasto, il
      // progetto resta senza nessuno in grado di riassegnare i ruoli e si
      // recupera solo da SQL.
      return a.payload?.id !== uid || next === 'admin';
    },
    // Normalizza PRIMA del dispatch: così lo state React contiene esattamente
    // il valore che finisce sul DB e i due livelli di permessi non ripartono
    // già disallineati.
    normalize: (a) => ({
      ...a,
      payload: {
        ...a.payload,
        role: toDbRole(a.payload?.role),
        seniority: toSeniority(a.payload),
      },
    }),
    // Solo le colonne che esistono davvero su public.users: il payload arriva
    // dalla card del pannello Team ed è il membro intero, campi derivati
    // (photoUrl, status, email…) compresi.
    //
    // Il ritentativo senza `seniority` copre la finestra in cui il codice è già
    // in produzione ma la migrazione 20260806120000 no — in questo progetto le
    // migrazioni si applicano a mano, quindi non è un caso limite. Il
    // sotto-livello è un dettaglio della matrice permessi; il RUOLO è la revoca
    // dei privilegi, e deve arrivare al database anche su uno schema vecchio
    // invece di fallire in blocco per una colonna accessoria.
    persist: async (s, a) => {
      const { id, name, role, color, capacity, seniority } = a.payload;
      const res = await UsersAPI.updateProfile(id, { name, role, color, capacity, seniority });
      if (!isMissingColumn(res?.error, 'seniority')) return rispecchiaRuoloScritto(res, role);
      console.warn('[VoyageDesk] colonna users.seniority assente: applicare la migrazione 20260806120000. Salvo il ruolo senza sotto-livello.');
      return rispecchiaRuoloScritto(await UsersAPI.updateProfile(id, { name, role, color, capacity }), role);
    },
    // Se la scrittura fallisce (o la RLS la rifiuta perché il chiamante non è
    // admin lato DB) lo stato ottimistico va riportato indietro: senza, la UI
    // continuerebbe a mostrare un ruolo che il database non ha — di nuovo il
    // disallineamento che questa entry esiste per chiudere.
    rollback: (s, a) => {
      const prev = (s.team || []).find(m => m.id === a.payload?.id);
      return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev } : null;
    },
    mapError: () => "ruolo non aggiornato, la modifica non è stata salvata",
  },

  APPROVE_TEAM_MEMBER: { persist: (s, a) => UsersAPI.approve(a.payload) },

  // Eliminazione definitiva via Edge Function delete-user: rimuove la riga
  // auth.users (CASCADE → public.users + user_contacts), così l'email torna
  // libera e l'invito può essere rifatto da zero.
  REMOVE_TEAM_MEMBER: { persist: (s, a) => UsersAPI.deleteUser(a.payload) },

  // Suggerimento strategico n. 3 dell'audit dell'11 agosto: `UsersAPI.setActive`
  // passa oggi dalla Edge Function 'set-user-active', che oltre al flag
  // applicativo revoca davvero la sessione (ban lato auth.admin) — vedi
  // lib/api.js e supabase/functions/set-user-active. "Disattivare" nel
  // pannello Team ora significa quello che dice, a prescindere da quali
  // percorsi server-side esisteranno domani.
  TOGGLE_TEAM_MEMBER_ACTIVE: {
    // Un admin non disattiva se stesso da qui: la Edge Function bannerebbe la
    // propria sessione nello stesso istante in cui la chiama, tagliandogli
    // l'accesso senza che nessun altro admin l'abbia deciso. Stesso principio
    // del guard su UPDATE_TEAM_MEMBER (self-demote) e del rifiuto in
    // delete-user (self-delete) — lì scritto nel corpo della Edge Function,
    // qui ripetuto perché deve fermare l'azione PRIMA della chiamata di rete,
    // non dopo un 400 che il ban ha già rifiutato.
    guard: (s, a, uid) => a.payload !== uid,
    persist: (s, a) => {
      const curr = (s.team || []).find(m => m.id === a.payload);
      return UsersAPI.setActive(a.payload, !curr?.active);
    },
    // Se la Edge Function fallisce (rete, l'utente target è sparito nel
    // frattempo) lo stato ottimistico va riportato indietro. TOGGLE_TEAM_
    // MEMBER_ACTIVE è la propria inversa — applica sempre `!active` sul valore
    // CORRENTE — quindi ridispatcharla una seconda volta con lo stesso payload
    // torna esattamente al punto di partenza, senza bisogno di uno snapshot.
    // Senza questo rollback la UI direbbe "Agente disattivato" mentre la
    // sessione dell'utente resta valida: la stessa classe di disallineamento
    // (M-1) che il resto di questo registro esiste per chiudere — qui con la
    // posta più alta, perché il dato che si scosta è chi può ancora accedere.
    rollback: (s, a) => ({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: a.payload }),
    mapError: (err) => err?.message || "stato di attivazione non aggiornato",
  },

  // ─── ADMIN: RESTORE BACKUP ─────────────────────────────────────────────────
  // Upsert (update se l'id/chiave esiste già, altrimenti create), coerente col
  // merge non distruttivo del reducer. Il team resta local-only come
  // ADD/UPDATE_TEAM_MEMBER: i membri sono righe auth.users, non ricreabili né
  // cancellabili da un restore client-side.
  RESTORE_BACKUP: {
    persist: (s, a) => {
      const payload = a.payload || {};
      const taskIds = new Set((s.tasks || []).map(t => t.id));
      const categoryKeys = new Set(Object.keys(s.categories || {}));
      const noticeIds = new Set((s.notices || []).map(n => n.id));
      const ops = [
        ...(Array.isArray(payload.tasks) ? payload.tasks.map(t => (taskIds.has(t.id)
          ? TasksAPI.update(t.id, toDbTaskPatch(t))
          : TasksAPI.create(toDbTask(t)))) : []),
        ...(payload.categories && typeof payload.categories === "object"
          ? Object.entries(payload.categories).map(([key, cat]) => (categoryKeys.has(key)
            ? CategoriesAPI.update(key, cat)
            : CategoriesAPI.create(toDbCategory({ key, ...cat })))) : []),
        ...(Array.isArray(payload.notices) ? payload.notices.map(n => (noticeIds.has(n.id)
          ? NoticesAPI.update(n.id, toDbNoticePatch(n))
          : NoticesAPI.create(toDbNotice(n)))) : []),
      ];
      return ops.length ? Promise.all(ops) : NOOP;
    },
  },

  // ─── PROFILO PERSONALE ─────────────────────────────────────────────────────
  // L'unica azione che l'utente esegue su SE STESSO, e l'unica che tocca due
  // tabelle: public.users (nome, iniziali, colore, foto) e public.user_contacts
  // (email, telefono), separate dalla migrazione 20260613100833.
  //
  // Finché non era qui, ProfileEditor faceva da sé: dispatch ottimistico, poi
  // due await a UsersAPI scritti a mano nel corpo del componente, un toast per
  // ciascuno e NESSUN rollback. Se la scrittura falliva — RLS, rete, trigger
  // anti-escalation — lo state React conservava i valori nuovi e la modale si
  // chiudeva lo stesso: l'utente vedeva il proprio profilo aggiornato mentre il
  // database non aveva ricevuto nulla, e se ne accorgeva solo al reload
  // successivo, quando il nome tornava indietro da solo. È lo stesso
  // disallineamento descritto in UPDATE_TEAM_MEMBER qui sopra, in un altro
  // punto dell'app: la ragione per cui questo registry esiste è che quella
  // classe di bug non si vede in review, si vede in produzione.
  //
  // Nessun guard: la riga scritta è sempre la PROPRIA (uid arriva dal reducer,
  // non dal payload), e le policy own-row lo confermano lato server.
  UPDATE_OWN_PROFILE: {
    persist: async (s, a, uid) => {
      const { name, avatar, color, photoUrl, email, phone } = a.payload || {};
      // Sequenziale e non Promise.all: se public.users rifiuta la scrittura,
      // mandare comunque i contatti lascerebbe il profilo aggiornato a metà sul
      // server — il caso peggiore, perché a quel punto nessun rollback può più
      // riportare indietro l'insieme.
      const prof = await UsersAPI.updateProfile(uid, {
        name, avatar, color, photo_url: photoUrl,
      });
      if (prof?.error) return prof;
      return UsersAPI.updateContact(uid, { email: email || null, phone: phone || null });
    },
    // Lo snapshot elenca i sei campi per esteso invece di passare `prev` intero:
    // il reducer applica solo le chiavi !== undefined, quindi un campo assente
    // dallo snapshot NON verrebbe riportato indietro e resterebbe al valore
    // ottimistico — un rollback parziale, che è peggio di nessun rollback
    // perché sembra riuscito. `?? null` lo rende totale.
    rollback: (s) => {
      const prev = (s.team || []).find(m => m.id === s.currentUserId);
      if (!prev) return null;
      return {
        type: "UPDATE_OWN_PROFILE",
        payload: {
          name: prev.name ?? null,
          avatar: prev.avatar ?? null,
          color: prev.color ?? null,
          photoUrl: prev.photoUrl ?? null,
          email: prev.email ?? null,
          phone: prev.phone ?? null,
        },
      };
    },
    mapError: (err) => err?.message || "profilo non aggiornato",
  },
};
