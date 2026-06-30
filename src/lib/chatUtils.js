// src/lib/chatUtils.js
// Utility pure per la chat (niente React/TEAM/CURRENT_USER: tutto via argomenti).

// Restringe l'elenco conversazioni alla vista PERSONALE dell'utente.
//
// Perché serve: le RLS di Supabase su `conversations` lasciano passare TUTTE
// le conversazioni agli admin (policy conversations_select con `OR is_admin()`).
// Senza questo filtro un admin si ritrova in lista le chat altrui — e non può
// nemmeno risponderci, perché messages_insert richiede auth.uid() ∈ participants
// → l'invio viene rifiutato dalle RLS ("i messaggi non arrivano a destinazione").
//
// Regole:
//  - tiene solo le conversazioni di cui `userId` è partecipante;
//  - scarta le DIRETTE il cui interlocutore non è (più) un membro valido:
//    sono conversazioni orfane che altrimenti compaiono come "Sconosciuto".
//    Il check sui membri si applica solo se `teamIds` è popolato (evita di
//    nascondere tutto durante il primo caricamento, prima che il team sia
//    idratato).
export const scopeConversationsForUser = (conversations, userId, teamIds) => {
  if (!Array.isArray(conversations)) return [];
  const ids = teamIds instanceof Set ? teamIds : new Set(teamIds || []);
  const teamReady = ids.size > 0;
  return conversations.filter(c => {
    const parts = c.participants || [];
    if (!parts.includes(userId)) return false;
    if (c.type === "direct" && teamReady) {
      const other = parts.find(p => p !== userId);
      if (other && !ids.has(other)) return false;
    }
    return true;
  });
};
