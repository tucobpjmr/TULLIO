// src/components/chat/chatReactions.js
// Emoji delle reazioni e memoria delle "usate di recente".
//
// La parte interessante è la persistenza: localStorage per la reattività
// immediata, tabella user_app_preferences per ritrovarle su un altro
// dispositivo. Nessun markup, quindi il picker resta un file di sola UI.
import { Users as UsersAPI } from "../../lib/api.js";
import { isUuid } from "../../lib/mappers.js";

export const EMOJI_REACTIONS = ["👍", "❤️", "😂", "🔥", "✅", "🎉", "💡", "🙌"];

// Fase 3 — set esteso di emoji per la modalità "+" del picker. Raggruppate
// per blocchi di senso (sentiment, gesti, oggetti, simboli, attività) così
// l'utente trova rapidamente quello che cerca senza dover scrollare un
// catalogo gigante. ~48 totali = compromesso ragionevole copertura/peso UI.
export const EMOJI_EXPANDED = [
  // sentiment
  "😀", "😅", "😍", "🤔", "😎", "😭", "😡", "🥳",
  // gesti
  "👏", "🙏", "🤝", "💪", "👌", "✋", "👋", "🤙",
  // simboli ok/no
  "✔️", "❌", "⚠️", "❓", "❗", "💯", "🆗", "⭐",
  // oggetti/lavoro
  "📌", "📎", "📅", "📞", "📧", "💼", "🏝️", "✈️",
  // tempo/soldi
  "⏰", "⏳", "💰", "💸", "🧾", "📊", "📈", "📉",
  // varie
  "🚀", "🎯", "🛠️", "🆘", "☕", "🍽️", "🎊", "✨",
];

// Fase 3 — reazioni recenti: le ultime emoji usate (anche dal set esteso)
// sono ricordate in localStorage e riproposte in cima al pannello esteso, così
// le custom usate spesso non vanno ricercate nella griglia ogni volta.
const RECENT_REACTIONS_KEY = "tullio_recent_reactions";
const RECENT_REACTIONS_MAX = 8;

export const loadRecentReactions = () => {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_REACTIONS_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter(e => typeof e === "string").slice(0, RECENT_REACTIONS_MAX) : [];
  } catch { return []; }
};

// Aggiunge un'emoji ai recenti. localStorage resta la cache veloce (lettura
// sincrona allo mount del picker); se l'utente è loggato (uuid reale) la lista
// completa viene anche sincronizzata server-side (user_app_preferences) così i
// recenti seguono l'utente su tutti i dispositivi.
export const pushRecentReaction = (emoji, userId) => {
  const next = [emoji, ...loadRecentReactions().filter(e => e !== emoji)].slice(0, RECENT_REACTIONS_MAX);
  try {
    localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(next));
  } catch { /* localStorage non disponibile: si prosegue col solo sync server */ }
  if (userId && isUuid(userId)) {
    UsersAPI.setRecentReactions(userId, next)
      .then(r => { if (r?.error) console.error("[chat] recent reactions sync", r.error); })
      .catch(err => console.error("[chat] recent reactions sync", err));
  }
};

// All'apertura della chat allinea la cache locale con il server: se il server
// ha già dei recenti (anche da un altro dispositivo) sono la fonte di verità e
// sovrascrivono la cache; se il server è vuoto ma localmente esistono recenti
// pregressi, li migra al server una volta. No-op per utenti non loggati (mock).
export const syncRecentReactionsFromServer = async (userId) => {
  if (!userId || !isUuid(userId)) return;
  try {
    const { data, error } = await UsersAPI.getPreferences(userId);
    if (error) return;
    const server = Array.isArray(data?.recent_reactions)
      ? data.recent_reactions.filter(e => typeof e === "string").slice(0, RECENT_REACTIONS_MAX)
      : [];
    if (server.length > 0) {
      try { localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(server)); } catch { /* cache non scrivibile */ }
    } else {
      const local = loadRecentReactions();
      if (local.length > 0) await UsersAPI.setRecentReactions(userId, local);
    }
  } catch (err) {
    console.error("[chat] recent reactions load", err);
  }
};
