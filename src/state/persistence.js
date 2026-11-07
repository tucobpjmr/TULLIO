// src/state/persistence.js
// Registry dichiarativo: per ogni action, come si riflette su Supabase. Guard
// e reducer chiamano le STESSE funzioni pure di lib/permissions.js sullo
// stesso `state.team` (verificato da persistenceGuards.test.js).
//
// FORMA DI UNA ENTRY (tutti i campi opzionali tranne `persist`):
//   guard(state, action, uid)      → false = negata: si dispatcha comunque al
//                                    reducer (toast di rifiuto), niente server.
//   normalize(action, state, uid)  → arricchisce il payload prima del dispatch.
//   persist(state, action, uid)    → l'operazione su Supabase, con lo state
//                                    PRE-dispatch. Promise, array di promise o
//                                    { error: null } per «niente da fare».
//   rollback(state, action, res)   → action da dispatchare se persist fallisce.
//   mapError(err)                  → testo utente al posto del messaggio grezzo.
//   offline: true                  → rigiocabile dalla coda offline (criterio
//                                    più sotto).
//   entityId(action, state, uid)   → id delle righe in scrittura, marcati «in
//                                    volo» finché persist non torna.
//
// entityId: fra il dispatch ottimistico e il commit, un refetch causato da un
// altro utente può tornare con la NOSTRA riga ancora vecchia, e l'eco della
// nostra scrittura viene scartata (origin_client): la UI resterebbe indietro.
// ⚠️ Si dichiara SE E SOLO SE una SET_* rilegge quell'entità in blocco
// fondendo i pendenti (state/pendingWrites.js): oggi task, clienti, avvisi e
// team. Le due metà si guastano in silenzio, ciascuna facendo sembrare fatta
// l'altra: le misura src/test/realtime/scrittureInVoloContract.test.js.
//
// L'orchestratore è src/hooks/useSyncedDispatch.js.

import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Clients as ClientsAPI, Categories as CategoriesAPI,
  MessageTemplates as MessageTemplatesAPI,
} from "../lib/api.js";
import {
  toDbTask, toDbNotice, toDbNoticePatch,
  toDbClient, toDbClientPatch, toDbCategory, toDbMessageTemplate, newId, isUuid,
} from "../lib/mappers.js";
import {
  canEditTask, canViewTask, canCreateTaskCategory, canEditNotice,
  canEditClient, canDeleteClient,
} from "../lib/permissions.js";
import { chiaveCliente } from "../lib/chiaveCliente.js";
// Team, restore backup e profilo: in persistenceAdmin.js (vedi sotto).
import { PERSISTENCE_ADMIN } from "./persistenceAdmin.js";
import {
  scriviTaskConfrontato, valoriAttesi, compensazioneConflitto,
} from "./scritturaTaskConfrontata.js";

// Risultato "nessuna operazione": stessa forma di una risposta supabase-js
// riuscita, così l'orchestratore non ha bisogno di un ramo speciale.
const NOOP = { error: null };

const findTask = (state, id) => (state.tasks || []).find(t => t.id === id);
const findNotice = (state, id) => (state.notices || []).find(n => n.id === id);

// I task che EMPTY_TRASH elimina: cestinati E gestibili dall'utente. Una
// definizione sola per `persist`, `rollback` e il reducer.
const daPurgare = (s, uid) =>
  (s.tasks || []).filter(t => t.deletedAt && canEditTask(s.team, t, uid));

// ─── M-2 · QUALI SCRITTURE SI POSSONO RIGIOCARE ─────────────────────────────
// `offline: true` è una promessa di IDEMPOTENZA: la coda (codaScritture.js)
// rigioca l'azione tale e quale, anche ore dopo, senza sapere se il primo
// tentativo era arrivato. Tre condizioni, tutte necessarie:
//   1. L'id della riga lo genera il CLIENT: una rigiocata trova `23505` e la
//      legge come «già scritta». Per questo ADD_COMMENT non c'è (l'id lo
//      assegna il server: una rigiocata farebbe un doppione).
//   2. `persist` NON legge `state`, solo l'azione normalizzata.
//   3. Il significato non scade («svuota il cestino» sì).
// ADD_TASKS_BULK resta fuori: scrive a blocchi, e un `23505` lì vuol dire
// «già fatta in parte».
export const PERSISTENCE = {
  // ─── TASKS ─────────────────────────────────────────────────────────────────
  // Ogni mutazione ha un rollback: una scrittura respinta non emette eventi
  // realtime, quindi nulla la correggerebbe. Il rollback rimanda la riga INTERA
  // pre-dispatch, o riusa l'azione inversa del reducer.
  ADD_TASK: {
    offline: true,
    guard: (s, a, uid) => canCreateTaskCategory(s.team, a.payload?.category, uid),
    normalize: (a) => ({
      ...a,
      payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() },
    }),
    // Riga non ancora sul server: senza marcarla, un refetch la farebbe sparire.
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
    // Tutte le righe del batch restano protette fino al commit.
    entityId: (a) => (a.payload || []).map(t => t.id),
    persist: (s, a) => (a.payload.length ? TasksAPI.createMany(a.payload.map(toDbTask)) : NOOP),
    // Insert atomica: se fallisce non esiste nessuna task, si tolgono tutte.
    rollback: (s, a) => ({ type: "ROLLBACK_TASKS_BULK", payload: a.payload.map(t => t.id) }),
  },

  UPDATE_TASK: {
    offline: true,
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.id);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload?.id,
    // M-1/M-2 · I valori che l'utente VEDEVA viaggiano con l'azione (anche in
    // coda), e la scrittura passa solo se il database li ha ancora (vedi
    // state/scritturaTaskConfrontata.js). Qui e non in `persist`, che non legge
    // lo stato.
    normalize: (a, s) => ({
      ...a,
      meta: { ...a.meta, attesi: valoriAttesi(findTask(s, a.payload?.id), a.payload) },
    }),
    persist: (s, a) => scriviTaskConfrontato(a.payload.id, a.payload, a.meta?.attesi),
    // Su conflitto si mostra la versione del collega, non la copia locale.
    rollback: (s, a, res) => {
      const conflitto = compensazioneConflitto(res);
      if (conflitto) return conflitto;
      const prev = findTask(s, a.payload?.id);
      return prev ? { type: "UPDATE_TASK", payload: prev } : null;
    },
    mapError: (err) => err?.message || "task non aggiornato",
  },

  MOVE_TASK: {
    offline: true,
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.taskId);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload?.taskId,
    normalize: (a, s) => ({
      ...a,
      meta: { ...a.meta, attesi: { status: findTask(s, a.payload?.taskId)?.status ?? null } },
    }),
    persist: (s, a) => scriviTaskConfrontato(
      a.payload.taskId, { status: a.payload.newStatus }, a.meta?.attesi),
    // `prev.status` è la colonna di partenza: un altro MOVE_TASK verso quella
    // riapplica anche `completedAtPatch` nel verso giusto.
    rollback: (s, a, res) => {
      const conflitto = compensazioneConflitto(res);
      if (conflitto) return conflitto;
      const prev = findTask(s, a.payload?.taskId);
      return prev ? { type: "MOVE_TASK", payload: { taskId: a.payload.taskId, newStatus: prev.status } } : null;
    },
    mapError: (err) => err?.message || "task non spostato",
  },

  DELETE_TASK: {
    offline: true,
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    entityId: (a) => a.payload,
    persist: (s, a) => TasksAPI.softDelete(a.payload),
    // RESTORE_TASK è l'inversa del soft delete.
    rollback: (s, a) => ({ type: "RESTORE_TASK", payload: a.payload }),
    mapError: (err) => err?.message || "task non spostato nel cestino",
  },

  RESTORE_TASK: {
    offline: true,
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
    // La riga eliminata non è rileggibile: si rimanda l'oggetto intero, via
    // ROLLBACK_EMPTY_TRASH.
    rollback: (s, a) => {
      const prev = findTask(s, a.payload);
      return prev ? { type: "ROLLBACK_EMPTY_TRASH", payload: [prev] } : null;
    },
    mapError: (err) => err?.message || "task non eliminato definitivamente",
  },

  // Senza questa entry «↩ Annulla» tornava indietro solo in UI.
  UNDO_LAST_ACTION: {
    // M-1 · Si annullano SOLO i campi che lo swipe aveva cambiato, e solo se
    // valgono ancora quanto lo swipe li aveva messi: la modifica di un collega
    // non si perde.
    persist: (s) => {
      const la = s.lastAction;
      if (la?.type === "MOVE_TASK") {
        return scriviTaskConfrontato(la.taskId, { status: la.prevStatus },
          la.newStatus !== undefined ? { status: la.newStatus } : undefined);
      }
      if (la?.type === "DELETE_TASK") return TasksAPI.restore(la.taskId);
      if (la?.type === "UPDATE_TASK") {
        return scriviTaskConfrontato(la.taskId, la.prevSnapshot,
          valoriAttesi(la.valoriSwipe ?? {}, la.prevSnapshot));
      }
      return NOOP;
    },
    // Se l'annullamento fallisce si rifà l'azione ORIGINALE: `s` è ancora lo
    // stato successivo allo swipe.
    rollback: (s, a, res) => {
      const conflitto = compensazioneConflitto(res);
      if (conflitto) return conflitto;
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

  // ⚠️ Il filtro coincide con quello del reducer (daPurgare): un non-admin non
  // deve eliminare task che nel suo Cestino non vede.
  // La purge va a blocchi (B-2 del 6 novembre: gli id vanno nell'URL). Ogni
  // blocco è atomico, l'insieme no: `res.eliminati` dice quali task il server
  // ha già tolto, e il rollback rimette in lista SOLO gli altri.
  EMPTY_TRASH: {
    persist: (s, a, uid) => {
      const ids = daPurgare(s, uid).map(t => t.id);
      return ids.length ? TasksAPI.hardDeleteMany(ids) : NOOP;
    },
    // `s` è PRE-dispatch: i task cestinati ci sono ancora, interi.
    rollback: (s, a, res) => {
      const giaEliminati = new Set(res?.eliminati ?? []);
      const tornati = daPurgare(s, s.currentUserId).filter(t => !giaEliminati.has(t.id));
      return tornati.length ? { type: "ROLLBACK_EMPTY_TRASH", payload: tornati } : null;
    },
    mapError: (err) => err?.message || "cestino non svuotato",
  },

  ADD_COMMENT: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.taskId);
      return !!prev && canViewTask(s.team, prev, uid);
    },
    // La riga da proteggere è quella del task a cui il commento è appeso.
    entityId: (a) => a.payload?.taskId,
    persist: (s, a, uid) => CommentsAPI.create({
      task_id: a.payload.taskId,
      user_id: uid,
      text: a.payload.comment?.text ?? "",
    }),
    // A-1 · Toglie il commento ottimistico respinto, per id LOCALE (il server
    // non lo riceve). Senza, riprovando se ne vedevano due e ne esisteva uno.
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
    // A-1 · Un'INSERT respinta non emette eventi: senza rollback l'avviso resta
    // pubblicato solo per chi l'ha scritto. Riusa DELETE_NOTICE.
    rollback: (s, a) => ({ type: "DELETE_NOTICE", payload: a.payload.id }),
    mapError: (err) => err?.message || "avviso non pubblicato",
  },
  // A-1 · Qui la RLS nega davvero (`author_id = auth.uid() OR
  // is_manager_or_admin()`, vedi canEditNotice): guard e rollback necessari.
  UPDATE_NOTICE: {
    guard: (s, a, uid) => canEditNotice(s.team, findNotice(s, a.payload?.id), uid),
    entityId: (a) => a.payload?.id,
    persist: (s, a) => NoticesAPI.update(a.payload.id, toDbNoticePatch(a.payload)),
    // Si rimanda l'avviso INTERO: il reducer fa merge sul payload, e un rollback
    // parziale sembrerebbe riuscito. Riusare UPDATE_NOTICE attiva
    // `meta.compensazione`, che ritira il toast di successo.
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
    // Come RESTORE_CLIENT: l'oggetto intero, la riga non è rileggibile.
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
    // TOGGLE_PIN_NOTICE è la propria inversa (`!pinned` sul valore corrente).
    rollback: (s, a) => ({ type: "TOGGLE_PIN_NOTICE", payload: a.payload }),
    mapError: () => "pin non aggiornato",
  },

  // ─── CRM: CLIENTI ──────────────────────────────────────────────────────────
  // L'id generato qui è quello che va sul database (toDbClient lo porta).
  // Guard con canEditClient, che rispecchia le policy clients_insert/update.
  ADD_CLIENT: {
    guard: (s, a, uid) => canEditClient(s.team, uid),
    normalize: (a) => ({
      ...a,
      payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() },
    }),
    entityId: (a) => a.payload?.id,
    persist: (s, a) => ClientsAPI.create(toDbClient(a.payload)),
    // Riga mai arrivata: va tolta, o la prossima scrittura che la usa fallisce
    // per foreign key. Riusa ROLLBACK_CLIENTS_BULK.
    rollback: (s, a) => ({ type: "ROLLBACK_CLIENTS_BULK", payload: [a.payload.id] }),
    mapError: (err) => err?.message || "cliente non salvato",
  },

  // A-2 · Import in blocco con rollback: un fallimento a metà lasciava in lista
  // clienti inesistenti, cioè il doppione al reimport.
  ADD_CLIENTS_BULK: {
    // M-1 · Anche l'import ha il guard: nascondere un bottone non è un controllo.
    guard: (s, a, uid) => canEditClient(s.team, uid),
    normalize: (a) => ({
      ...a,
      payload: (a.payload || []).map(c => ({ ...c, id: isUuid(c?.id) ? c.id : newId() })),
    }),
    entityId: (a) => (a.payload || []).map(c => c.id),
    persist: (s, a) => (a.payload.length
      ? ClientsAPI.createMany(a.payload.map(toDbClient))
      : NOOP),
    // Toglie SOLO i clienti non arrivati (`res.scritti` blocchi sono scritti):
    // toglierli tutti farebbe reimportare, cioè il doppione.
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

  // toDbClientPatch: l'id è già nel WHERE, non si riscrive la chiave primaria.
  UPDATE_CLIENT: {
    guard: (s, a, uid) => canEditClient(s.team, uid),
    entityId: (a) => a.payload?.id,
    persist: (s, a) => ClientsAPI.update(a.payload.id, toDbClientPatch(a.payload)),
    // La scheda INTERA pre-dispatch, non un patch (come UPDATE_NOTICE).
    rollback: (s, a) => {
      const prev = (s.clients || []).find(c => c.id === a.payload?.id);
      return prev ? { type: "UPDATE_CLIENT", payload: prev } : null;
    },
    mapError: (err) => err?.message || "cliente non aggiornato",
  },

  // Rename del cliente nei task che lo citano (task.client è testo libero).
  // Stesso filtro del reducer: chiave normalizzata + canEditTask.
  // M-2 · `Promise.allSettled`: ogni update procede da solo, e i soli id
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
      // «N task su M non aggiornati» dice cosa è successo.
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
    // 23503 = foreign key (liste ancora collegate): messaggio comprensibile.
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
  // Come le categorie: letti da tutti, scritti dall'admin (ADMIN_ONLY_ACTIONS).
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
  // In state/persistenceAdmin.js: stesso contratto, file separato per il tetto
  // fisico.
  ...PERSISTENCE_ADMIN,
};
