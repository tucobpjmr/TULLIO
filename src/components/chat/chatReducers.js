// src/components/chat/chatReducers.js
// I due reducer locali della chat: uno per la conversazione aperta, uno per la
// navigazione del pannello. Sono funzioni pure — stanno insieme e fuori dai
// componenti proprio perché si possano testare come tali.


// ─── CHAT: REDUCERS ────────────────────────────────────────────────────────
// convViewReducer: local UI state for an open conversation.
// Keeps related fields atomic: e.g. AFTER_SEND clears input+replyingTo+taskRef in one step.
export const convViewInitial = {
  input: "", recording: false, replyingTo: null,
  showAttach: false, showTemplates: false,
  showMsgSearch: false, msgSearch: "", showPinnedOnly: false,
  typingMap: {}, pendingTaskRef: null, uploading: false,
  // A-5 · vero fra un invio fallito e la prossima modifica/invio: dice al
  // composer di mostrare «non inviato — riprova» invece di far ricomparire il
  // testo perso senza spiegazione, indistinguibile da una bozza qualsiasi.
  invioFallito: false,
};
export function convViewReducer(s, a) {
  switch (a.type) {
    case "INPUT":          return { ...s, input: a.v, invioFallito: false };
    case "APPEND_INPUT":   return { ...s, input: s.input ? `${s.input}\n${a.v}` : a.v };
    case "AFTER_SEND":     return { ...s, input: "", replyingTo: null, pendingTaskRef: null, invioFallito: false };
    case "RECORDING":      return { ...s, recording: a.v };
    case "REPLYING":       return { ...s, replyingTo: a.v };
    case "TOGGLE_ATTACH":  return { ...s, showAttach: !s.showAttach, showTemplates: false };
    case "CLOSE_ATTACH":   return { ...s, showAttach: false };
    case "TOGGLE_TMPL":    return { ...s, showTemplates: !s.showTemplates, showAttach: false };
    case "CLOSE_TMPL":     return { ...s, showTemplates: false };
    case "TOGGLE_SEARCH":  return { ...s, showMsgSearch: !s.showMsgSearch, msgSearch: "" };
    case "SEARCH":         return { ...s, msgSearch: a.v };
    case "CLOSE_SEARCH":   return { ...s, showMsgSearch: false, msgSearch: "" };
    case "TOGGLE_PINNED":  return { ...s, showPinnedOnly: !s.showPinnedOnly };
    case "SET_TYPING_MAP": return { ...s, typingMap: a.v };
    case "UPLOADING":      return { ...s, uploading: a.v };
    case "PREFILL":        return { ...s, input: a.text, pendingTaskRef: a.taskRef ?? null, invioFallito: false };
    // A-5 · il testo di un messaggio il cui invio è fallito torna nel
    // composer, marcato — a differenza di PREFILL, che è un suggerimento in
    // ingresso e non un recupero da un fallimento.
    case "RESTORE_FALLITO": return { ...s, input: a.text, pendingTaskRef: a.taskRef ?? null, invioFallito: true };
    default: return s;
  }
}

// chatPanelReducer: navigation state for the whole chat panel.
export const chatPanelInitial = {
  activeConv: null, newMode: false,
  prefillText: "", prefillTaskRef: null, forwardingMsg: null,
};
export function chatPanelReducer(s, a) {
  switch (a.type) {
    case "ACTIVATE":      return { ...s, activeConv: a.conv, newMode: false };
    case "BACK":          return { ...s, activeConv: null, prefillText: "", prefillTaskRef: null };
    case "NEW_MODE":      return { ...s, newMode: a.v };
    case "PREFILL":       return { ...s, prefillText: a.text, prefillTaskRef: a.taskRef ?? null };
    case "CLEAR_PREFILL": return { ...s, prefillText: "", prefillTaskRef: null };
    case "FWD_START":     return { ...s, forwardingMsg: a.payload };
    case "FWD_CLEAR":     return { ...s, forwardingMsg: null };
    default: return s;
  }
}
