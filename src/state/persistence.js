// src/state/persistence.js
// Registry dichiarativo: per ogni action, come si riflette su Supabase.
//
// PERCHÉ ESISTE. Sostituisce lo `switch` da 283 righe che viveva nel wrapper
// `dispatch` di VoyageDesk.jsx (due copie parallele dei controlli di permesso,
// da tenere allineate a mano — vedi git log per il dettaglio). Oggi guard e
// reducer chiamano le STESSE funzioni pure di lib/permissions.js sullo stesso
// `state.team`, e src/test/persistenceGuards.test.js verifica per ogni action
// che il verdetto del guard coincida con quello del reducer.
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
//   entityId(action, state, uid)   → id (o array di id) delle righe che questa
//                                    azione sta scrivendo. Serve a marcarle come
//                                    "scrittura in volo" finché persist non si è
//                                    conclusa: vedi sotto. `state` è quello
//                                    PRE-dispatch, come per persist: serve solo
//                                    a UPDATE_OWN_PROFILE, l'unica mutazione il
//                                    cui soggetto non sta nel payload.
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
// LA REGOLA, che è ciò che serve sapere per scrivere una entry nuova: dichiara
// `entityId` se e solo se una SET_* rilegge quell'entità IN BLOCCO fondendo il
// registro dei pendenti (vedi state/pendingWrites.js). Oggi sono task, clienti,
// avvisi e — da A-3 dell'audit del 28 agosto — il TEAM. Su categorie e template
// il campo marcherebbe id che nessuno consulta: le loro sottoscrizioni sono
// `senzaCanale`, quindi nessun evento altrui fa ripartire il refetch e la
// finestra non esiste. Sui clienti era così anche lì finché `clients` non è
// entrata in realtime: la finestra da cui proteggersi nasce con il refetch
// concorrente, non con la tabella.
//
// ⚠️ IL «SE E SOLO SE» È LETTERALE, ed è la ragione per cui il team è rimasto
// scoperto un anno senza che nulla lo dicesse: le due metà si guastano in
// silenzio, ciascuna facendo sembrare fatta l'altra. Un `fondiScrittureInVolo`
// senza `entityId` fonde una mappa sempre vuota — protezione che si legge nel
// reducer e non esiste; un `entityId` senza fusione marca id che nessuno
// consulta. Da A-3 la regola non è più solo scritta qui:
// src/test/realtime/scrittureInVoloContract.test.js la misura sulle due metà.
//
// L'orchestratore che le esegue è src/hooks/useSyncedDispatch.js.

import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Clients as ClientsAPI, Categories as CategoriesAPI,
  MessageTemplates as MessageTemplatesAPI,
} from "../lib/api.js";
import {
  toDbTask, toDbTaskPatch, toDbNotice, toDbNoticePatch,
  toDbClient, toDbClientPatch, toDbCategory, toDbMessageTemplate, newId, isUuid,
} from "../lib/mappers.js";
import {
  canEditTask, canViewTask, canCreateTaskCategory, canEditNotice,
  canEditClient, canDeleteClient,
} from "../lib/permissions.js";
import { chiaveCliente } from "../lib/chiaveCliente.js";
// Team, restore backup e profilo personale: in un file proprio, vedi la nota
// sopra ...PERSISTENCE_ADMIN più sotto.
import { PERSISTENCE_ADMIN } from "./persistenceAdmin.js";

// Risultato "nessuna operazione": stessa forma di una risposta supabase-js
// riuscita, così l'orchestratore non ha bisogno di un ramo speciale.
const NOOP = { error: null };

const findTask = (state, id) => (state.tasks || []).find(t => t.id === id);
const findNotice = (state, id) => (state.notices || []).find(n => n.id === id);

// I task che EMPTY_TRASH deve davvero eliminare: cestinati E gestibili
// dall'utente corrente. Una definizione sola, letta da `persist` e da
// `rollback`, perché le due devono parlare esattamente dello stesso insieme —
// e perché è lo stesso filtro che il reducer applica allo state (vedi il case
// EMPTY_TRASH e src/test/persistenceGuards.test.js).
const daPurgare = (s, uid) =>
  (s.tasks || []).filter(t => t.deletedAt && canEditTask(s.team, t, uid));

export const PERSISTENCE = {
  // ─── TASKS ─────────────────────────────────────────────────────────────────
  // A-1 dell'audit del 1 settembre: dei task avevano rollback su UNA sola
  // entry di questa famiglia (ADD_TASKS_BULK), contro il 100% di clienti e
  // team — e nessun evento realtime viene mai a correggere da solo una
  // scrittura fallita: il server non ha scritto nulla, quindi non emette
  // nulla. Il sintomo peggiore era MOVE_TASK: uno spostamento di colonna
  // respinto dal server lasciava la task nella colonna sbagliata per sempre.
  // Ogni rollback qui sotto rimanda la riga INTERA pre-dispatch (non un
  // patch, per la stessa ragione di UPDATE_CLIENT/UPDATE_NOTICE) o riusa
  // l'azione inversa già esistente nel reducer.
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
    // Riusa ROLLBACK_TASKS_BULK (un array di id) come fa ADD_CLIENT con
    // ROLLBACK_CLIENTS_BULK.
    rollback: (s, a) => ({ type: "ROLLBACK_TASKS_BULK", payload: [a.payload.id] }),
    mapError: (err) => err?.message || "task non salvato",
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
    rollback: (s, a) => {
      const prev = findTask(s, a.payload?.id);
      return prev ? { type: "UPDATE_TASK", payload: prev } : null;
    },
    mapError: (err) => err?.message || "task non aggiornato",
  },

  MOVE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.taskId);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload?.taskId,
    persist: (s, a) => TasksAPI.update(a.payload.taskId, { status: a.payload.newStatus }),
    // `s` è lo stato PRE-dispatch: `prev.status` è ancora la colonna di
    // partenza. Si rimanda un altro MOVE_TASK verso quella, così il case del
    // reducer applica anche il suo `completedAtPatch` nella direzione giusta.
    rollback: (s, a) => {
      const prev = findTask(s, a.payload?.taskId);
      return prev ? { type: "MOVE_TASK", payload: { taskId: a.payload.taskId, newStatus: prev.status } } : null;
    },
    mapError: (err) => err?.message || "task non spostato",
  },

  DELETE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload,
    persist: (s, a) => TasksAPI.softDelete(a.payload),
    // RESTORE_TASK è la propria inversa: senza, un soft delete rifiutato dal
    // server lasciava la task cestinata in UI e ancora attiva sul database.
    rollback: (s, a) => ({ type: "RESTORE_TASK", payload: a.payload }),
    mapError: (err) => err?.message || "task non spostato nel cestino",
  },

  RESTORE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload,
    persist: (s, a) => TasksAPI.restore(a.payload),
    rollback: (s, a) => ({ type: "DELETE_TASK", payload: a.payload }),
    mapError: (err) => err?.message || "task non ripristinato",
  },

  PURGE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload,
    persist: (s, a) => TasksAPI.hardDelete(a.payload),
    // La riga eliminata in ottimistico non è più rileggibile dal server: si
    // rimanda l'oggetto INTERO pre-dispatch, come RESTORE_CLIENT. Riusa
    // ROLLBACK_EMPTY_TRASH (un array di task da rimettere in lista, senza
    // guard né toast propri) invece di un case dedicato per una riga sola.
    rollback: (s, a) => {
      const prev = findTask(s, a.payload);
      return prev ? { type: "ROLLBACK_EMPTY_TRASH", payload: [prev] } : null;
    },
    mapError: (err) => err?.message || "task non eliminato definitivamente",
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
    // Se QUESTA scrittura fallisce, il reducer ha già applicato l'annullamento
    // in ottimistico: si rifà l'azione ORIGINALE (non un "annulla
    // l'annullamento"). `s` è lo stato PRE-dispatch, cioè ancora quello
    // successivo allo swipe che si sta annullando, quindi basta rileggerlo da
    // lì senza un secondo snapshot.
    rollback: (s) => {
      const la = s.lastAction;
      if (!la) return null;
      if (la.type === "MOVE_TASK") {
        const cur = findTask(s, la.taskId);
        return cur ? { type: "MOVE_TASK", payload: { taskId: la.taskId, newStatus: cur.status } } : null;
      }
      if (la.type === "DELETE_TASK") return { type: "DELETE_TASK", payload: la.taskId };
      if (la.type === "UPDATE_TASK") {
        const cur = findTask(s, la.taskId);
        return cur ? { type: "UPDATE_TASK", payload: cur } : null;
      }
      return null;
    },
    mapError: (err) => err?.message || "annullamento non riuscito",
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
    // A-1 dell'audit del 2 settembre. Senza, un'INSERT respinta lasciava
    // l'utente davanti a DUE affermazioni contraddittorie insieme: il proprio
    // commento nel thread e, sotto, «Commento non inviato» da useSalvataggio —
    // e riprovando ne otteneva due a schermo e uno solo sul server. Si
    // identifica per l'id LOCALE: CommentsAPI.create non lo manda al server
    // (costruisce la riga da task_id/user_id/text), quindi quel valore è per
    // definizione l'identità di ciò che sul database non esiste.
    rollback: (s, a) => ({
      type: "ROLLBACK_COMMENT",
      payload: { taskId: a.payload?.taskId, commentId: a.payload?.comment?.id },
    }),
    mapError: (err) => err?.message || "commento non inviato",
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
    entityId: (a) => a.payload?.id,
    persist: (s, a) => NoticesAPI.create(toDbNotice(a.payload)),
    // A-1 dell'audit del 2 settembre. Era l'unica delle quattro entry degli
    // avvisi senza compensazione, ed è quella che CREA: un'INSERT respinta non
    // emette alcun evento realtime, quindi nessun refetch viene a togliere
    // l'avviso dalla bacheca di chi l'ha scritto, che resta pubblicato mentre
    // il resto del team non lo vedrà mai. Riusa DELETE_NOTICE (il case esiste
    // e il suo canEditNotice passa: `normalize` ha appena messo `author =
    // uid`) invece di un case nuovo, come ADD_CLIENT riusa
    // ROLLBACK_CLIENTS_BULK.
    rollback: (s, a) => ({ type: "DELETE_NOTICE", payload: a.payload.id }),
    mapError: (err) => err?.message || "avviso non pubblicato",
  },
  // A-1 dell'audit del 14 agosto: erano le uniche tre mutazioni del registry
  // senza guard NÉ rollback, mentre sono anche le uniche su cui la RLS nega
  // davvero qualcosa (`author_id = auth.uid() OR is_manager_or_admin()`, vedi
  // canEditNotice in lib/permissions.js). Senza il guard, un non-autore
  // vedeva il reducer applicare in ottimistico e mostrare "Avviso aggiornato/
  // rimosso" — poi la RLS rifiutava la scrittura e, senza rollback, l'avviso
  // restava disallineato dal database fino al prossimo reload (una DELETE
  // fallita non produce un evento realtime che la corregga).
  UPDATE_NOTICE: {
    guard: (s, a, uid) => canEditNotice(s.team, findNotice(s, a.payload?.id), uid),
    entityId: (a) => a.payload?.id,
    persist: (s, a) => NoticesAPI.update(a.payload.id, toDbNoticePatch(a.payload)),
    // Rimanda un altro UPDATE_NOTICE con l'avviso INTERO pre-dispatch, come
    // UPDATE_TEAM_MEMBER: il case del reducer fa merge di `...action.payload`
    // sulla riga ESISTENTE, quindi rimandare indietro un sottoinsieme
    // lascerebbe a video i campi che il patch aveva cambiato — un rollback
    // parziale, che sembra riuscito ed è peggio di nessuno. Riusare
    // UPDATE_NOTICE (invece di un case dedicato) è anche ciò che fa
    // scattare `meta.compensazione` nel wrapper reducer, che riporta indietro
    // i toast: senza, "Avviso aggiornato" comparirebbe accanto a
    // "Salvataggio fallito" sullo stesso gesto.
    rollback: (s, a) => {
      const prev = findNotice(s, a.payload?.id);
      return prev ? { type: "UPDATE_NOTICE", payload: prev } : null;
    },
    mapError: () => "avviso non aggiornato",
  },
  DELETE_NOTICE: {
    guard: (s, a, uid) => canEditNotice(s.team, findNotice(s, a.payload), uid),
    entityId: (a) => a.payload,
    persist: (s, a) => NoticesAPI.remove(a.payload),
    // Come RESTORE_CLIENT: si rimanda l'oggetto intero, non l'id — la riga
    // cancellata in ottimistico non è più rileggibile dal server.
    rollback: (s, a) => {
      const prev = findNotice(s, a.payload);
      return prev ? { type: "RESTORE_NOTICE", payload: prev } : null;
    },
    mapError: () => "avviso non eliminato",
  },
  TOGGLE_PIN_NOTICE: {
    guard: (s, a, uid) => canEditNotice(s.team, findNotice(s, a.payload), uid),
    entityId: (a) => a.payload,
    persist: (s, a) => {
      const prev = findNotice(s, a.payload);
      return NoticesAPI.togglePin(a.payload, !prev?.pinned);
    },
    // TOGGLE_PIN_NOTICE è la propria inversa (applica sempre `!pinned` sul
    // valore corrente): ridispatcharla torna al punto di partenza, senza
    // bisogno di uno snapshot — stessa proprietà di TOGGLE_TEAM_MEMBER_ACTIVE.
    rollback: (s, a) => ({ type: "TOGGLE_PIN_NOTICE", payload: a.payload }),
    mapError: () => "pin non aggiornato",
  },

  // ─── CRM: CLIENTI ──────────────────────────────────────────────────────────
  // L'id generato qui è ora quello che finisce anche sul database (toDbClient
  // lo porta con sé): prima il DB ne assegnava uno proprio via
  // gen_random_uuid() e lo stato React conservava l'altro, rendendo
  // UPDATE_CLIENT/DELETE_CLIENT no-op fino al reload successivo.
  // `isUuid` come per i task: un id già valido non va rigenerato.
  //
  // A-1 dell'audit del 14 agosto (secondo passaggio): le tre mutazioni erano
  // le uniche del registry senza `guard` — stessa lacuna già chiusa sugli
  // avvisi lo stesso giorno, rimasta aperta qui. canEditClient rispecchia le
  // policy RLS clients_insert/update (vedi lib/permissions.js).
  ADD_CLIENT: {
    guard: (s, a, uid) => canEditClient(s.team, uid),
    normalize: (a) => ({
      ...a,
      payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() },
    }),
    entityId: (a) => a.payload?.id,
    persist: (s, a) => ClientsAPI.create(toDbClient(a.payload)),
    // La riga inserita in ottimistico non esiste sul server se l'INSERT non
    // arriva: senza rimuoverla, l'utente ci lavora sopra (una lista viaggio,
    // un task) e la scrittura successiva fallisce per foreign key su un
    // cliente che non è mai esistito. Riusa ROLLBACK_CLIENTS_BULK (accetta un
    // array di id) invece di un case nuovo che farebbe la stessa cosa.
    rollback: (s, a) => ({ type: "ROLLBACK_CLIENTS_BULK", payload: [a.payload.id] }),
    mapError: (err) => err?.message || "cliente non salvato",
  },

  // A-2 dell'audit dell'11 agosto: N `create()` in Promise.all non è né
  // atomico (una riga rifiutata da vincolo/RLS/rete lascia passare le altre)
  // né compensato (nessun rollback), mentre il gemello ADD_TASKS_BULK ha
  // entrambi. Su un import che arriva a centinaia di righe per file, un
  // fallimento a metà lasciava in lista clienti che sul server non
  // esistevano — scoperto solo al reload, e con il sintomo peggiore possibile
  // su un'anagrafica: il doppione, che non si deduplica da solo.
  ADD_CLIENTS_BULK: {
    // M-1 dell'audit del 14 agosto (terzo passaggio). A-1 del secondo
    // passaggio ha dato un guard ad ADD_CLIENT/UPDATE_CLIENT/DELETE_CLIENT e
    // ha saltato il gemello in blocco: l'import restava l'unica scrittura
    // sull'anagrafica protetta dal solo fatto che ClientiView non renderizzi
    // il pulsante per chi non ha `canEditClient`. È esattamente ciò che il
    // registry delle Liste dichiara di non voler più accettare — «nascondere
    // un bottone non è un controllo: è una scelta di layout» — e su un
    // percorso che scrive centinaia di righe di PII in un colpo solo.
    guard: (s, a, uid) => canEditClient(s.team, uid),
    normalize: (a) => ({
      ...a,
      payload: (a.payload || []).map(c => ({ ...c, id: isUuid(c?.id) ? c.id : newId() })),
    }),
    entityId: (a) => (a.payload || []).map(c => c.id),
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
  UPDATE_CLIENT: {
    guard: (s, a, uid) => canEditClient(s.team, uid),
    entityId: (a) => a.payload?.id,
    persist: (s, a) => ClientsAPI.update(a.payload.id, toDbClientPatch(a.payload)),
    // Si rimanda la scheda INTERA pre-dispatch, non un patch: il case del
    // reducer fa merge di `...action.payload` sulla riga esistente, quindi un
    // sottoinsieme lascerebbe a video i campi che il patch aveva cambiato — un
    // rollback parziale, che sembra riuscito ed è peggio di nessuno. Stessa
    // ragione di UPDATE_NOTICE e UPDATE_TEAM_MEMBER.
    rollback: (s, a) => {
      const prev = (s.clients || []).find(c => c.id === a.payload?.id);
      return prev ? { type: "UPDATE_CLIENT", payload: prev } : null;
    },
    mapError: (err) => err?.message || "cliente non aggiornato",
  },

  // Propagazione del rename cliente sui task che lo citano per nome
  // (task.client è testo libero, non una FK). Il filtro deve essere lo STESSO
  // del reducer — chiave normalizzata + canEditTask — altrimenti UI e database
  // toccherebbero righe diverse.
  //
  // M-2 dell'audit del 14 agosto (secondo passaggio). Prima era un
  // `Promise.all` di N update senza alcuna compensazione: il reducer ha già
  // rinominato TUTTI i task idonei, e se una delle N update falliva (rete,
  // RLS su un task riassegnato nel frattempo) lo schermo mostrava il nome
  // nuovo ovunque mentre il server ne aveva una parte con quello vecchio — e
  // siccome la scheda cliente trova i task PER NOME, quelli rimasti indietro
  // smettevano di comparirci, in silenzio. `Promise.allSettled` (non `.all`,
  // che si fermerebbe al primo rifiuto lasciando ignoto l'esito degli altri)
  // fa procedere ogni update indipendentemente dagli altri, e i soli id
  // falliti tornano al nome precedente.
  RENAME_CLIENT_IN_TASKS: {
    persist: async (s, a, uid) => {
      const { from, to } = a.payload || {};
      const k = chiaveCliente(from);
      if (!k || !to || chiaveCliente(to) === k) return NOOP;
      const daAggiornare = (s.tasks || [])
        .filter(t => chiaveCliente(t.client) === k && canEditTask(s.team, t, uid));
      if (!daAggiornare.length) return NOOP;
      const esiti = await Promise.allSettled(
        daAggiornare.map(t => TasksAPI.update(t.id, { client_id: to })));
      const falliti = daAggiornare.filter((_, i) =>
        esiti[i].status === "rejected" || esiti[i].value?.error);
      // Il messaggio conta quanti — "N task su M non aggiornati" è
      // actionable, "Salvataggio fallito" da solo non lo è.
      return falliti.length
        ? { error: { message: `${falliti.length} task su ${daAggiornare.length} non aggiornati` }, falliti }
        : { error: null };
    },
    rollback: (s, a, res) => (res?.falliti?.length
      ? { type: "ROLLBACK_RENAME_CLIENT_IN_TASKS", payload: { ids: res.falliti.map(t => t.id), from: a.payload?.from } }
      : null),
  },

  DELETE_CLIENT: {
    guard: (s, a, uid) => canDeleteClient(s.team, uid),
    entityId: (a) => a.payload,
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

  // ─── ADMIN: TEAM, RESTORE BACKUP, PROFILO PERSONALE ────────────────────────
  // In state/persistenceAdmin.js: stesso contratto di entry, stesso
  // orchestratore, separate in un file proprio solo perché questo aveva
  // superato la soglia fisica di scripts/verifica-convenzioni — lo stesso
  // spezzare-lungo-un-confine-che-esisteva-già già fatto per lib/api.js.
  ...PERSISTENCE_ADMIN,
};
