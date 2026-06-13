// Presence (Step H): mappa userId → 'online'|'away'|'offline'
// calcolata dal last_seen_at (online <60s, away <5min, altrimenti offline).
export function computePresence(user) {
  if (!user || !user.last_seen_at) return 'offline';
  if (user.status === 'offline') return 'offline';
  const age = Date.now() - new Date(user.last_seen_at).getTime();
  if (age < 60 * 1000) return user.status === 'away' ? 'away' : 'online';
  if (age < 5 * 60 * 1000) return 'away';
  return 'offline';
}

export const PRESENCE_COLORS = {
  online: '#2D7A4F',
  away: '#E0A800',
  offline: '#94a3b8',
};
