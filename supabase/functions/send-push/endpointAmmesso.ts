// supabase/functions/send-push/endpointAmmesso.ts
//
// B-1 dell'analisi del 16 novembre. `send-push` fa una POST all'endpoint
// salvato in `push_subscriptions`, e quell'endpoint lo scrive il client: senza
// controllo la funzione chiama qualunque URL scelto da un utente (anche http,
// anche un host interno). Qui si ammettono solo https verso i servizi push
// dei browser.
//
// ⛔ Modulo puro e senza import: lo esegue anche Vitest (src/test/edge/).

/** Suffissi di host dei servizi Web Push: FCM (Chrome, Edge su Android, Opera,
 *  Samsung), Mozilla, Apple, Windows (WNS). Un host è ammesso se coincide o ne
 *  è un sottodominio. */
export const HOST_PUSH_AMMESSI = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

export function endpointAmmesso(endpoint: unknown): boolean {
  if (typeof endpoint !== "string") return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port !== "" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return HOST_PUSH_AMMESSI.some((h) => host === h || host.endsWith(`.${h}`));
}
