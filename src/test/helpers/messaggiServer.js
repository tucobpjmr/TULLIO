// Il doppio di `Messages.ultimiPerConversazioni` (lib/api/chat.js): dato
// l'insieme dei messaggi «sul server», consegna gli ultimi `limit` di ogni
// conversazione chiesta e segna troncate quelle con la pagina piena — come la
// funzione vera, che fa una `listForConversation` per conversazione.
// `risposta` ha la forma di una risposta Supabase: `{ data, error }`.
export const comeServer = (risposta) => async (ids, { limit = 50 } = {}) => {
  if (risposta?.error) return { data: null, error: risposta.error, troncate: [] };
  const righe = risposta?.data || [];
  const data = [];
  const troncate = [];
  for (const id of ids || []) {
    const qui = righe.filter((r) => r.conversation_id === id);
    if (qui.length >= limit) troncate.push(id);
    data.push(...qui.slice(-limit));
  }
  return { data, error: null, troncate };
};
