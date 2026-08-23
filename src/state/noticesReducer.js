// src/state/noticesReducer.js
// La bacheca avvisi come reducer suo, staccato da state/reducer.js.
//
// PERCHÉ ESISTE. `state/reducer.js` aveva una deroga esplicita a `max-lines`
// (tetto 550 invece di 500) e il commento che la concedeva diceva anche quando
// sarebbe scaduta: «Se il reducer arriva lì, la domanda giusta non è alzare
// ancora il numero — è se una fetta di dominio meriti un reducer suo». Il file
// era a 543 righe effettive, sette dal tetto: la deroga era esaurita, e la
// risposta scritta lì è questa, non un 600.
//
// PERCHÉ PROPRIO QUESTA FETTA. La proprietà che rendeva il reducer unico
// leggibile — vedere in un colpo solo tutto ciò che può succedere allo state —
// si perde davvero solo quando si spezza una MACCHINA A STATI su più file: due
// case che leggono lo stesso campo finiti in due posti diversi. Non è il caso
// della bacheca. I sette case qui sotto toccano `state.notices` e nient'altro
// (più `state.toasts`, che è la coda dei messaggi, non un dominio), e nessun
// case rimasto in reducer.js legge `notices`. Il taglio è lungo un confine che
// esisteva già, non una linea tracciata per far tornare un numero.
//
// IL CONTRATTO. Ritorna `null` — non `state` — per ogni azione che non
// possiede. È la differenza che permette la delega in cima a `baseReducer`:
// `null` significa «non è mia, continua», mentre uno `state` invariato
// significherebbe «l'ho gestita io e non cambia nulla», e mangerebbe in
// silenzio ogni azione del resto dell'app.
//
// PERMESSI. Il pre-check admin del wrapper `reducer` in state/reducer.js resta
// dov'è e continua a valere: nessuna azione della bacheca è admin-only, ma il
// gate per-avviso (`canEditNotice`) è qui, ed è la stessa funzione pura che
// consultano `state/persistence.js` e i componenti. Il rilievo A-1 dell'audit
// del 14 agosto spiega perché quel controllo debba stare ANCHE nel reducer e
// non solo nel guard di persistence: si veda il commento sui tre case.
import { canEditNotice } from "../lib/permissions.js";
import { pushToast } from "./toastQueue.js";
import { fondiScrittureInVolo, applicaRigaRealtime } from "./pendingWrites.js";

/**
 * @param {any} state
 * @param {{type: string, payload?: any}} action
 * @returns {any|null} il nuovo state, oppure null se l'azione non è di questa fetta.
 */
export function noticesReducer(state, action) {
  const uid = state.currentUserId;
  const _denied = (msg) =>
    ({ ...state, toasts: pushToast(state.toasts, { message: msg, type: "error" }) });

  switch (action.type) {
    case "SET_NOTICES": {
      // Stessa protezione di SET_TASKS (A-1, terzo passaggio): un avviso con
      // una scrittura in volo non va sostituito con il pre-immagine che il
      // server sta ancora servendo.
      return { ...state, notices: fondiScrittureInVolo(action.payload, state.notices, state.pendingWrites) };
    }
    // Gemello di MERGE_TASK_ROW per la bacheca: nessun campo derivato da
    // altrove, quindi nessun `fondiRiga` da passare.
    case "MERGE_NOTICE_ROW":
      return { ...state, notices: applicaRigaRealtime(state.notices, state.pendingWrites, action.payload) };
    case "ADD_NOTICE": {
      const notices = [action.payload, ...state.notices];
      return { ...state, notices, toasts: pushToast(state.toasts, { message: "Avviso pubblicato in bacheca", type: "success" }) };
    }
    // A-1 dell'audit del 14 agosto: prima queste tre azioni non controllavano
    // ALCUN permesso qui — a differenza di UPDATE_TASK/DELETE_TASK, che
    // negano con canEditTask prima di applicare. Il gate viveva solo nel
    // guard di persistence.js, e useSyncedDispatch, quando un guard nega,
    // dispatcha comunque l'AZIONE ORIGINALE contando sul reducer per
    // produrre il toast di rifiuto (vedi il commento in cima a quel file).
    // Senza canEditNotice anche qui, quella richiesta veniva applicata in
    // locale lo stesso — "Avviso aggiornato" mostrato a un utente la cui
    // scrittura la RLS avrebbe respinto, e nessun rollback lo correggeva
    // perché dal punto di vista dell'orchestratore l'azione non era stata
    // negata affatto. Stesso pattern dei task: `if (!prev) return state`
    // (record fantasma, no-op silenzioso) poi `if (!canEditNotice(...))
    // return _denied()`.
    case "UPDATE_NOTICE": {
      const prev = state.notices.find(n => n.id === action.payload.id);
      if (!prev) return state;
      if (!canEditNotice(state.team, prev, uid)) return _denied("Non hai i permessi per modificare questo avviso");
      const notices = state.notices.map(n =>
        n.id === action.payload.id
          ? { ...n, ...action.payload, updatedAt: new Date().toISOString() }
          : n
      );
      return { ...state, notices, toasts: pushToast(state.toasts, { message: "Avviso aggiornato", type: "success" }) };
    }
    case "DELETE_NOTICE": {
      const prev = state.notices.find(n => n.id === action.payload);
      if (!prev) return state;
      if (!canEditNotice(state.team, prev, uid)) return _denied("Non hai i permessi per eliminare questo avviso");
      const notices = state.notices.filter(n => n.id !== action.payload);
      return { ...state, notices, toasts: pushToast(state.toasts, { message: "Avviso rimosso dalla bacheca", type: "success" }) };
    }
    case "TOGGLE_PIN_NOTICE": {
      const prev = state.notices.find(n => n.id === action.payload);
      if (!prev) return state;
      if (!canEditNotice(state.team, prev, uid)) return _denied("Non hai i permessi per fissare questo avviso");
      const notices = state.notices.map(n =>
        n.id === action.payload ? { ...n, pinned: !n.pinned } : n
      );
      return { ...state, notices };
    }
    // Riporta in bacheca un avviso la cui DELETE_NOTICE ottimistica è stata
    // respinta dal DB (RLS: non è l'autore né un manager/admin) — gemello
    // silenzioso di RESTORE_CLIENT. Senza questo case la UI resterebbe
    // disallineata dal database finché non arriva un reload completo: una
    // DELETE fallita non produce un evento realtime che la corregga (A-1
    // dell'audit del 14 agosto). UPDATE_NOTICE non ne ha bisogno: il suo
    // rollback rimanda un altro UPDATE_NOTICE, che il case sopra applica come
    // un merge sulla riga esistente.
    case "RESTORE_NOTICE": {
      if (!action.payload || (state.notices || []).some(n => n.id === action.payload.id)) return state;
      return { ...state, notices: [...(state.notices || []), action.payload] };
    }
    case "TOGGLE_NOTICE_REACTION": {
      // v2.8: stesso shape della chat — { emoji: [userId, ...] }. Toggle del
      // userId corrente. Se la lista finisce vuota, l'emoji viene rimosso.
      const { noticeId, emoji } = action.payload || {};
      const me = state.currentUserId;
      if (!noticeId || !emoji || !me) return state;
      const notices = state.notices.map(n => {
        if (n.id !== noticeId) return n;
        const reactions = { ...(n.reactions || {}) };
        const users = reactions[emoji] || [];
        if (users.includes(me)) {
          const next = users.filter(u => u !== me);
          if (next.length === 0) delete reactions[emoji];
          else reactions[emoji] = next;
        } else {
          reactions[emoji] = [...users, me];
        }
        return { ...n, reactions };
      });
      return { ...state, notices };
    }

    default: return null;
  }
}
