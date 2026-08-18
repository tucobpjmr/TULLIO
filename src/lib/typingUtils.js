// src/lib/typingUtils.js
// Logica PURA per il typing indicator realtime della chat (niente React/Supabase).
//
// Il typing è uno stato EFFIMERO: non va persistito su DB, viaggia solo via
// broadcast (vedi subscribeToTyping in lib/api.js). Ogni client mantiene una
// mappa { userId: expiresAt } di chi sta scrivendo; le voci scadono da sole
// (auto-expire) così se un evento "stop" si perde l'indicatore sparisce comunque.
//
// Queste funzioni sono estratte qui per essere testabili senza montare la UI né
// aprire una connessione realtime reale.

// Ogni "typing:start" tiene vivo l'utente per TTL ms. Il mittente ripete lo
// "start" a intervalli < TTL mentre digita, così la voce non scade finché scrive.
export const TYPING_TTL_MS = 4000;
// Anti-flood: il mittente ripubblica "typing:start" al massimo ogni PING ms.
export const TYPING_PING_MS = 2500;
// Dopo STOP ms di inattività sull'input il mittente pubblica "typing:stop".
export const TYPING_STOP_MS = 3000;

// Rimuove dalla mappa { userId: expiresAt } le voci scadute (expiresAt <= now).
// Ritorna SEMPRE una nuova mappa (immutabile), coi soli typer ancora attivi.
export const pruneTypingMap = (map, now = Date.now()) => {
  const out = {};
  for (const [userId, expiresAt] of Object.entries(map || {})) {
    if (typeof expiresAt === "number" && expiresAt > now) out[userId] = expiresAt;
  }
  return out;
};

// Applica un evento typing (start/stop) alla mappa e ritorna la nuova mappa.
//  - typing:true  → (ri)fissa expiresAt = now + ttl per userId
//  - typing:false → rimuove userId
// Esclude sempre selfId: non mostriamo mai "tu stai scrivendo".
/**
 * @param {Record<string, number>} map
 * @param {{userId?: string, typing?: boolean}} [evento]
 * @param {{selfId?: string, now?: number, ttl?: number}} [opzioni]
 */
export const applyTypingEvent = (
  map,
  { userId, typing } = {},
  { selfId, now = Date.now(), ttl = TYPING_TTL_MS } = {},
) => {
  const next = pruneTypingMap(map, now);
  if (!userId || userId === selfId) return next;
  if (typing) next[userId] = now + ttl;
  else delete next[userId];
  return next;
};

// Elenco degli userId che stanno scrivendo (non scaduti), self escluso.
/**
 * @param {Record<string, number>} map
 * @param {{selfId?: string, now?: number}} [opzioni]
 */
export const typingUserIds = (map, { selfId, now = Date.now() } = {}) =>
  Object.keys(pruneTypingMap(map, now)).filter((id) => id !== selfId);

// Costruisce l'etichetta "sta scrivendo" gestendo il caso gruppo con più typer.
//  - direct: sempre "sta scrivendo" (l'unico altro partecipante è implicito).
//  - group 1 typer:  "Mario sta scrivendo"
//  - group 2 typer:  "Mario e Luca stanno scrivendo"
//  - group 3+ typer: "3 persone stanno scrivendo"
// resolveName(userId) deve tornare il nome (breve) da mostrare.
/**
 * @param {string[]} userIds
 * @param {{type?: string, resolveName?: (id: string) => string}} [opzioni]
 */
export const buildTypingLabel = (userIds, { type, resolveName } = {}) => {
  if (!Array.isArray(userIds) || userIds.length === 0) return null;
  if (type === "direct") return "sta scrivendo";
  const names = userIds.map((id) => resolveName?.(id) || "Qualcuno");
  if (names.length === 1) return `${names[0]} sta scrivendo`;
  if (names.length === 2) return `${names[0]} e ${names[1]} stanno scrivendo`;
  return `${names.length} persone stanno scrivendo`;
};
