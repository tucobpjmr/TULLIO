// src/components/chat/chatPresence.js
// Presenza degli utenti in chat: dal record `users` al pallino colorato.
//
// Estratto da ChatPanel.jsx (che ne aveva 2.238 di righe): lo usano sia la
// lista conversazioni sia la testata della conversazione aperta, ed è logica
// pura — nessun hook, testabile senza montare niente.

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
