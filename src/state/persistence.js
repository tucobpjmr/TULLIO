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
//
// L'orchestratore che le esegue è src/hooks/useSyncedDispatch.js.

import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Users as UsersAPI, Clients as ClientsAPI, Categories as CategoriesAPI,
} from "../lib/api.js";
import {
  toDbTask, toDbTaskPatch, toDbNotice, toDbNoticePatch,
  toDbClient, toDbCategory, newId, isUuid,
} from "../lib/mappers.js";
import { canEditTask, canViewTask, canCreateTaskCategory } from "../lib/permissions.js";
import { chiaveNome } from "../lib/clientNotes.js";

// Risultato "nessuna operazione": stessa forma di una risposta supabase-js
// riuscita, così l'orchestratore non ha bisogno di un ramo speciale.
const NOOP = { error: null };

const findTask = (state, id) => (state.tasks || []).find(t => t.id === id);

export const PERSISTENCE = {
  // ─── TASKS ─────────────────────────────────────────────────────────────────
  ADD_TASK: {
    guard: (s, a, uid) => canCreateTaskCategory(s.team, a.payload?.category, uid),
    normalize: (a) => ({
      ...a,
      payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() },
    }),
    persist: (s, a) => TasksAPI.create(toDbTask(a.payload)),
  },

  ADD_TASKS_BULK: {
    guard: (s, a, uid) => (a.payload || []).every(t => canCreateTaskCategory(s.team, t?.category, uid)),
    normalize: (a) => ({
      ...a,
      payload: (a.payload || []).map(t => ({ ...t, id: isUuid(t?.id) ? t.id : newId() })),
    }),
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
    persist: (s, a) => TasksAPI.update(a.payload.id, toDbTaskPatch(a.payload)),
  },

  MOVE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.taskId);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    persist: (s, a) => TasksAPI.update(a.payload.taskId, { status: a.payload.newStatus }),
  },

  DELETE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    persist: (s, a) => TasksAPI.softDelete(a.payload),
  },

  RESTORE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
    persist: (s, a) => TasksAPI.restore(a.payload),
  },

  PURGE_TASK: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload);
      return !!prev && canEditTask(s.team, prev, uid);
    },
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
  // per canEditTask(state.team, …) e persistenceGuards.test.js lo verifica.
  EMPTY_TRASH: {
    persist: (s, a, uid) => {
      const ids = (s.tasks || []).filter(t => t.deletedAt && canEditTask(s.team, t, uid)).map(t => t.id);
      return ids.length ? Promise.all(ids.map(id => TasksAPI.hardDelete(id))) : NOOP;
    },
  },

  ADD_COMMENT: {
    guard: (s, a, uid) => {
      const prev = findTask(s, a.payload.taskId);
      return !!prev && canViewTask(s.team, prev, uid);
    },
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
  ADD_CLIENT: {
    normalize: (a) => ({ ...a, payload: { ...a.payload, id: newId() } }),
    persist: (s, a) => ClientsAPI.create(toDbClient(a.payload)),
  },

  ADD_CLIENTS_BULK: {
    normalize: (a) => ({
      ...a,
      payload: (a.payload || []).map(c => ({ ...c, id: isUuid(c?.id) ? c.id : newId() })),
    }),
    persist: (s, a) => (a.payload.length
      ? Promise.all(a.payload.map(c => ClientsAPI.create(toDbClient(c))))
      : NOOP),
  },

  UPDATE_CLIENT: { persist: (s, a) => ClientsAPI.update(a.payload.id, toDbClient(a.payload)) },

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

  // ─── ADMIN: TEAM ───────────────────────────────────────────────────────────
  // Persistiamo solo le azioni che operano su utenti reali (creati via signup o
  // invito). ADD/UPDATE_TEAM_MEMBER restano locali: ADD non ha una riga
  // auth.users associata, e UPDATE del ruolo richiederebbe il mapping all'enum
  // DB (niente sotto-ruolo Junior/Senior nello schema attuale).
  APPROVE_TEAM_MEMBER: { persist: (s, a) => UsersAPI.approve(a.payload) },

  // Eliminazione definitiva via Edge Function delete-user: rimuove la riga
  // auth.users (CASCADE → public.users + user_contacts), così l'email torna
  // libera e l'invito può essere rifatto da zero.
  REMOVE_TEAM_MEMBER: { persist: (s, a) => UsersAPI.deleteUser(a.payload) },

  TOGGLE_TEAM_MEMBER_ACTIVE: {
    persist: (s, a) => {
      const curr = (s.team || []).find(m => m.id === a.payload);
      return UsersAPI.setActive(a.payload, !curr?.active);
    },
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
};
