// src/components/chat/chatPresence.js
// Presenza degli utenti in chat: dal record `users` al pallino colorato.
//
// Estratto da ChatPanel.jsx (che ne aveva 2.238 di righe): lo usano sia la
// lista conversazioni sia la testata della conversazione aperta, ed è logica
// pura — nessun hook, testabile senza montare niente.

// B-6 · Ogni quanto i componenti che mostrano la presenza si ri-renderizzano
// per farla invecchiare. Sta QUI e non nei due call site perché è determinato
// dalle soglie di `computePresence` qui sotto — 60 s per «online», 5 minuti per
// «assente»: 30 secondi è la metà della soglia più stretta, cioè il pallino non
// resta mai sbagliato per più di mezzo passo. Cambiare le soglie senza guardare
// questo numero è il modo in cui l'ageing smette di funzionare in silenzio.
export const TICK_PRESENZA_MS = 30 * 1000;

export function computePresence(user) {
  if (!user || !user.last_seen_at) return 'offline';
  if (user.status === 'offline') return 'offline';
  const age = Date.now() - new Date(user.last_seen_at).getTime();
  if (age < 60 * 1000) {
    // 'busy' è manuale (heartbeat lo rinnova ogni 30s finché attivo)
    if (user.status === 'busy') return 'busy';
    return user.status === 'away' ? 'away' : 'online';
  }
  if (age < 5 * 60 * 1000) return 'away';
  return 'offline';
}
export const PRESENCE_COLORS = {
  online: '#2D7A4F',
  away: '#E0A800',
  busy: '#C0392B',
  offline: '#94a3b8',
};
export const PRESENCE_LABELS = {
  online: 'Online',
  away: 'Assente',
  busy: 'Occupato',
  offline: 'Offline',
};
