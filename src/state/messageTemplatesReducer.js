// src/state/messageTemplatesReducer.js
// I template dei messaggi chat come reducer suo, staccato da state/reducer.js.
//
// PERCHÉ ESISTE. Stessa ragione di state/noticesReducer.js — la deroga a
// `max-lines` del reducer era arrivata a sette righe dal proprio tetto, e il
// commento che la concedeva indicava questa come la risposta giusta invece di
// alzare il numero. Il perché del contratto `null` e il criterio con cui si
// sceglie una fetta stanno lì, in un posto solo.
//
// PERCHÉ PROPRIO QUESTA. È la fetta più piccola e più isolata delle due:
// quattro case che toccano `state.messageTemplates` e la coda dei toast,
// nessun altro case dell'app che legga quel campo. Le tre mutazioni sono
// admin-only, ma il gate NON è qui: sta in ADMIN_ONLY_ACTIONS nel wrapper
// `reducer` di state/reducer.js, che gira prima di questa delega. Spostarlo
// avrebbe diviso su due file una decisione di autorizzazione oggi presa in un
// punto solo — esattamente il costo che questa estrazione deve evitare.
import { pushToast } from "./toastQueue.js";

/**
 * @param {any} state
 * @param {{type: string, payload?: any}} action
 * @returns {any|null} il nuovo state, oppure null se l'azione non è di questa fetta.
 */
export function messageTemplatesReducer(state, action) {
  switch (action.type) {
    case "ADD_MESSAGE_TEMPLATE": {
      const { label, text } = action.payload || {};
      if (!label?.trim() || !text?.trim()) return state;
      // L'id normale arriva già assegnato da persistence.js (normalize, come
      // ADD_CLIENT/ADD_NOTICE): è lo stesso che finisce sulla riga DB, quindi
      // UPDATE/DELETE successivi nella stessa sessione colpiscono la riga
      // giusta. In modalità demo (dispatch non sincronizzato, niente
      // persistence.normalize) il payload non ha id: si genera un
      // placeholder locale, come prima di questa correzione.
      const tpl = { id: action.payload.id || ("mt" + Date.now()), label: label.trim(), text: text.trim() };
      return {
        ...state,
        messageTemplates: [...(state.messageTemplates || []), tpl],
        toasts: pushToast(state.toasts, { message: "Template aggiunto", type: "success" }),
      };
    }
    case "UPDATE_MESSAGE_TEMPLATE": {
      const { id, label, text } = action.payload || {};
      const messageTemplates = (state.messageTemplates || []).map(t =>
        t.id === id ? { ...t, ...(label !== undefined ? { label } : {}), ...(text !== undefined ? { text } : {}) } : t
      );
      return { ...state, messageTemplates, toasts: pushToast(state.toasts, { message: "Template aggiornato", type: "success" }) };
    }
    case "DELETE_MESSAGE_TEMPLATE": {
      const messageTemplates = (state.messageTemplates || []).filter(t => t.id !== action.payload);
      return { ...state, messageTemplates, toasts: pushToast(state.toasts, { message: "Template rimosso", type: "success" }) };
    }
    // Idratazione (useAppHydration, come SET_CATEGORIES): sostituisce
    // l'intero elenco con quello letto da public.message_templates. Niente
    // toast, come le altre SET_* di idratazione silenziosa.
    case "SET_MESSAGE_TEMPLATES": {
      return { ...state, messageTemplates: Array.isArray(action.payload) ? action.payload : [] };
    }

    default: return null;
  }
}
