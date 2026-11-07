// src/state/persistenceAdmin.js
// Le entry del registry per il pannello Admin (team, restore backup, profilo
// personale), aggregate in `PERSISTENCE` da state/persistence.js. File
// separato per il tetto fisico: contratto e spiegazione restano in cima a
// persistence.js.
import {
  Tasks as TasksAPI, Notices as NoticesAPI, Users as UsersAPI, Categories as CategoriesAPI,
} from "../lib/api.js";
import {
  toDbTask, toDbTaskPatch, toDbNotice, toDbNoticePatch, toDbCategory,
} from "../lib/mappers.js";
import { isAdmin } from "../lib/permissions.js";
import { toDbRole, toSeniority } from "../lib/taskConstants.js";

// Duplicata e non importata: niente giro di import fra i due file.
const NOOP = { error: null };

// «Colonna inesistente» da PostgREST (PGRST204) o Postgres (42703): uno schema
// non ancora migrato, non un errore da mostrare.
const isMissingColumn = (err, column) => {
  if (!err) return false;
  const code = err.code ?? '';
  if (code !== 'PGRST204' && code !== '42703') return false;
  return String(err.message ?? '').includes(column);
};

// M-5 · Il trigger `fix_users_privilege_escalation` ripristina IN SILENZIO
// role/active/pending/capacity quando chi scrive non è admin per il database
// (la UPDATE «riesce»). Il guard locale può sbagliare (revoca appena fatta
// altrove): si confronta il ruolo della riga tornata (dopo il trigger) con
// quello richiesto. Senza `data` non c'è nulla da confrontare.
const rispecchiaRuoloScritto = (res, ruoloRichiesto) => {
  if (res?.error || !res?.data) return res;
  if (res.data.role !== ruoloRichiesto) {
    return { data: res.data, error: { message: 'la modifica è stata rifiutata dal database (permessi insufficienti)' } };
  }
  return res;
};

export const PERSISTENCE_ADMIN = {
  // ─── ADMIN: TEAM ───────────────────────────────────────────────────────────
  // ADD_TEAM_MEMBER resta locale: senza email non c'è riga auth.users (con email
  // il percorso è l'invito).
  // UPDATE_TEAM_MEMBER DEVE arrivare al database: è il modo con cui un admin
  // revoca i privilegi.
  UPDATE_TEAM_MEMBER: {
    // M-5 · Guard proprio, non solo ADMIN_ONLY_ACTIONS: è l'unica vera barriera di
    // una revoca, e il trigger DB la neutralizzerebbe in silenzio.
    guard: (s, a, uid) => {
      if (!isAdmin(s.team, uid)) return false;
      const next = toDbRole(a.payload?.role);
      if (!next) return false;                 // ruolo fuori enum → non si scrive
      // Un admin non declassa se stesso: se è l'ultimo, si recupera solo da SQL.
      return a.payload?.id !== uid || next === 'admin';
    },
    // Normalizza PRIMA del dispatch: lo state ha il valore che va sul DB.
    normalize: (a) => ({
      ...a,
      payload: {
        ...a.payload,
        role: toDbRole(a.payload?.role),
        seniority: toSeniority(a.payload),
      },
    }),
    // Solo le colonne di public.users (il payload è il membro intero).
    // Ritenta senza `seniority` se la migrazione 20260806120000 non c'è ancora: il
    // RUOLO deve arrivare anche su uno schema vecchio.
    persist: async (s, a) => {
      const { id, name, role, color, capacity, seniority } = a.payload;
      const res = await UsersAPI.updateProfile(id, { name, role, color, capacity, seniority });
      if (!isMissingColumn(res?.error, 'seniority')) return rispecchiaRuoloScritto(res, role);
      console.warn('[VoyageDesk] colonna users.seniority assente: applicare la migrazione 20260806120000. Salvo il ruolo senza sotto-livello.');
      return rispecchiaRuoloScritto(await UsersAPI.updateProfile(id, { name, role, color, capacity }), role);
    },
    // Scrittura fallita o rifiutata dalla RLS: si riporta indietro il ruolo.
    rollback: (s, a) => {
      const prev = (s.team || []).find(m => m.id === a.payload?.id);
      return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev } : null;
    },
    mapError: () => "ruolo non aggiornato, la modifica non è stata salvata",
    // A-3 · SET_TEAM rilegge in blocco: senza marcatura un refetch altrui
    // riporterebbe a schermo il ruolo appena revocato.
    entityId: (a) => a.payload?.id,
  },

  // M-2 · Approvare e rimuovere hanno un rollback: una scrittura fallita non
  // emette eventi, e l'admin crederebbe di aver dato un accesso che non ha dato.
  // `UsersAPI.approve` usa CONTA_RIGHE: un rifiuto della RLS diventa visibile.
  APPROVE_TEAM_MEMBER: {
    // C-1 · `payload` è `{ id, role }`: il ruolo scelto dall'admin all'approvazione.
    persist: (s, a) => UsersAPI.approve(a.payload.id, a.payload.role),
    // Il membro INTERO pre-dispatch: rimandare solo `{ pending: true }` lascerebbe
    // l'`active` cambiato (rollback parziale).
    rollback: (s, a) => {
      const prev = (s.team || []).find(m => m.id === a.payload.id);
      return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev } : null;
    },
    mapError: (err) => err?.message || "utente non approvato",
    // A-3 · La riga in volo è `payload.id`.
    entityId: (a) => a.payload?.id,
  },

  // Eliminazione definitiva via Edge Function delete-user (CASCADE su
  // public.users e user_contacts): l'email torna invitabile.
  REMOVE_TEAM_MEMBER: {
    persist: (s, a) => UsersAPI.deleteUser(a.payload),
    // L'oggetto intero, come RESTORE_CLIENT. L'ordine lo ristabilisce il primo
    // refresh realtime.
    rollback: (s, a) => {
      const prev = (s.team || []).find(m => m.id === a.payload);
      return prev ? { type: "ADD_TEAM_MEMBER", payload: prev } : null;
    },
    mapError: (err) => err?.message || "utente non eliminato",
    // A-3 · Riga tolta in ottimistico: senza marcatura un refetch farebbe
    // riapparire l'utente appena eliminato.
    entityId: (a) => a.payload,
  },

  // `UsersAPI.setActive` passa dalla Edge Function set-user-active, che revoca
  // davvero la sessione (ban in GoTrue) oltre al flag.
  TOGGLE_TEAM_MEMBER_ACTIVE: {
    // Un admin non disattiva se stesso: si ferma qui, prima della rete (lo
    // rifiuta anche la Edge Function).
    guard: (s, a, uid) => a.payload !== uid,
    persist: (s, a) => {
      const curr = (s.team || []).find(m => m.id === a.payload);
      return UsersAPI.setActive(a.payload, !curr?.active);
    },
    // TOGGLE_TEAM_MEMBER_ACTIVE è la propria inversa (`!active` sul valore
    // corrente): ridispatcharla torna al punto di partenza.
    rollback: (s, a) => ({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: a.payload }),
    mapError: (err) => err?.message || "stato di attivazione non aggiornato",
    // A-3 · La posta più alta: `active` decide chi può ancora accedere.
    entityId: (a) => a.payload,
  },

  // ─── ADMIN: RESTORE BACKUP ─────────────────────────────────────────────────
  // Upsert, come il merge non distruttivo del reducer. Il team resta fuori
  // (righe auth.users).
  // M-1 · Job a blocchi di `RESTORE_CHUNK`; ogni fallimento è tracciato per riga
  // (tipo, chiave, se esisteva) e compensato con precisione.
  RESTORE_BACKUP: {
    persist: async (s, a) => {
      const payload = a.payload || {};
      const taskIds = new Set((s.tasks || []).map(t => t.id));
      const categoryKeys = new Set(Object.keys(s.categories || {}));
      const noticeIds = new Set((s.notices || []).map(n => n.id));

      // `esisteva`: una riga esistente torna al valore pre-dispatch, una riga
      // creata da questo restore si toglie.
      const jobs = [
        ...(Array.isArray(payload.tasks) ? payload.tasks.map(t => ({
          tipo: "tasks", key: t.id, esisteva: taskIds.has(t.id),
          run: () => (taskIds.has(t.id) ? TasksAPI.update(t.id, toDbTaskPatch(t)) : TasksAPI.create(toDbTask(t))),
        })) : []),
        ...(payload.categories && typeof payload.categories === "object"
          ? Object.entries(payload.categories).map(([key, cat]) => ({
            tipo: "categories", key, esisteva: categoryKeys.has(key),
            run: () => (categoryKeys.has(key) ? CategoriesAPI.update(key, cat) : CategoriesAPI.create(toDbCategory({ key, ...cat }))),
          })) : []),
        ...(Array.isArray(payload.notices) ? payload.notices.map(n => ({
          tipo: "notices", key: n.id, esisteva: noticeIds.has(n.id),
          run: () => (noticeIds.has(n.id) ? NoticesAPI.update(n.id, toDbNoticePatch(n)) : NoticesAPI.create(toDbNotice(n))),
        })) : []),
      ];
      if (!jobs.length) return NOOP;

      const RESTORE_CHUNK = 50;
      const falliti = [];
      for (let i = 0; i < jobs.length; i += RESTORE_CHUNK) {
        const blocco = jobs.slice(i, i + RESTORE_CHUNK);
        const esiti = await Promise.allSettled(blocco.map(j => j.run()));
        esiti.forEach((esito, idx) => {
          const errore = esito.status === "rejected" ? esito.reason : esito.value?.error;
          if (errore) falliti.push({ ...blocco[idx], error: errore });
        });
        // Nessuno short-circuit: ogni riga è una chiamata indipendente.
      }
      return falliti.length ? { error: falliti[0].error, falliti } : { error: null };
    },
    // Riporta indietro SOLO le righe in `res.falliti`; le altre sono arrivate.
    rollback: (s, a, res) => {
      const falliti = res?.falliti || [];
      if (!falliti.length) return null;
      /** @type {{tasks: any[], categories: Record<string, any>, notices: any[]}} */
      const daRipristinare = { tasks: [], categories: {}, notices: [] };
      /** @type {{tasks: any[], categories: any[], notices: any[]}} */
      const daRimuovere = { tasks: [], categories: [], notices: [] };
      for (const f of falliti) {
        if (f.esisteva) {
          if (f.tipo === "tasks") {
            const prev = (s.tasks || []).find(t => t.id === f.key);
            if (prev) daRipristinare.tasks.push(prev);
          } else if (f.tipo === "categories") {
            const prev = (s.categories || {})[f.key];
            if (prev) daRipristinare.categories[f.key] = prev;
          } else if (f.tipo === "notices") {
            const prev = (s.notices || []).find(n => n.id === f.key);
            if (prev) daRipristinare.notices.push(prev);
          }
        } else {
          daRimuovere[f.tipo].push(f.key);
        }
      }
      return { type: "ROLLBACK_RESTORE_BACKUP", payload: { daRipristinare, daRimuovere } };
    },
    mapError: (err) => err?.message || "ripristino backup incompleto: alcune righe non sono state salvate",
  },

  // ─── PROFILO PERSONALE ─────────────────────────────────────────────────────
  // L'azione dell'utente su se stesso: public.users (nome, iniziali, colore,
  // foto) e public.user_contacts (email, telefono).
  // Nessun guard: la riga è sempre la PROPRIA (uid dal reducer), e le policy
  // own-row lo confermano.
  UPDATE_OWN_PROFILE: {
    persist: async (s, a, uid) => {
      const { name, avatar, color, photoUrl, email, phone } = a.payload || {};
      // Sequenziale: se public.users rifiuta, i contatti non partono (niente
      // profilo aggiornato a metà sul server).
      const prof = await UsersAPI.updateProfile(uid, {
        name, avatar, color, photo_url: photoUrl,
      });
      if (prof?.error) return prof;
      return UsersAPI.updateContact(uid, { email: email || null, phone: phone || null });
    },
    // I sei campi per esteso con `?? null`: il reducer applica solo le chiavi
    // definite, e un campo assente resterebbe al valore ottimistico.
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
    // A-3 · Il soggetto non è nel payload ma l'utente loggato: senza marcatura
    // un refetch riporterebbe indietro il profilo appena salvato.
    entityId: (a, s, uid) => uid,
  },
};
