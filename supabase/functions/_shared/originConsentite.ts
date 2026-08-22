// supabase/functions/_shared/originConsentite.ts
//
// "QUALI HOST APPARTENGONO A QUESTO PROGETTO", scritto una volta.
//
// PERCHÉ ESISTE (A-4 dell'audit del 22 agosto). La stessa regola viveva in due
// copie — `_shared/cors.ts` e `safeRedirect()` in `invite-user/index.ts` — e
// non erano divergenti: erano identiche e sbagliate insieme, che è il modo in
// cui i controlli duplicati falliscono (vedi il preambolo di
// `requireActiveAdmin.ts`, nato dallo stesso difetto).
//
// L'errore condiviso era trattare un PREFISSO come una allow-list:
//
//     if (label.startsWith("tullio-") && !label.includes(".")) return true;
//
// `tullio-*.vercel.app` non descrive un insieme di host che il progetto
// possiede: descrive un insieme che CHIUNQUE può ampliare, perché Vercel
// assegna il sottodominio in base al nome del progetto e nulla riserva quel
// prefisso all'organizzazione proprietaria di `tullio-seven`. Un progetto
// gratuito chiamato `tullio-qualsiasi-cosa` ottiene
// `tullio-qualsiasi-cosa.vercel.app`, e da lì passava entrambi i controlli.
//
// ─── PERCHÉ NESSUN PATTERN, NEMMENO CON LO SCOPE DEL TEAM ──────────────────
//
// La tentazione successiva è `tullio-*-tooco-s-projects.vercel.app`, che
// sembra sicuro perché lo scope del team non è replicabile. Non lo è, e per la
// stessa ragione di prima: il nome di un progetto Vercel è testo libero, quindi
// un progetto chiamato `tullio-git-x-y-tooco-s-projects` ottiene quell'esatto
// hostname se nessun deployment lo ha già rivendicato. Lo scope compare
// nell'hostname, non lo protegge.
//
// Qui si elencano perciò gli host UNO PER UNO. Sono i tre che il progetto
// Vercel possiede davvero, verificati il 22 agosto 2026 sull'account
// `tooco-s-projects`, progetto `tullio`:
//
//   tullio-seven.vercel.app                       ← alias di produzione
//   tullio-tooco-s-projects.vercel.app            ← alias di progetto
//   tullio-git-main-tooco-s-projects.vercel.app   ← alias del branch main
//
// ⚠️ COSA SI PERDE, E COME RIAVERLO. Le URL di deployment effimere
// (`tullio-git-<branch>-<hash>-tooco-s-projects.vercel.app`, la forma che
// Vercel genera per i branch dal nome lungo) NON sono in elenco e non possono
// esserci: cambiano a ogni push. Da una preview effimera le Edge Function
// rispondono quindi con l'Origin di produzione, e il browser impedisce alla
// pagina di leggere la risposta — le operazioni admin non funzionano da lì.
// È una perdita stretta e deliberata: se serve provare un invito da una
// preview, si aggiunge il suo hostname a ORIGIN_PROPRIE per la durata della
// prova, oppure si usa l'alias di branch, che è stabile ed è già in elenco.
//
// La stessa scelta è documentata in docs/SICUREZZA.md §9 per la allow-list dei
// Redirect URL di Supabase Auth (C-1): le due devono dire la stessa cosa,
// altrimenti una delle due è la scorciatoia che riapre l'altra.

/** L'origine di produzione: il fallback quando l'Origin non è riconosciuto. */
export const PROD_ORIGIN = "https://tullio-seven.vercel.app";

/**
 * Gli hostname che questo progetto possiede. Elencati, non descritti da un
 * pattern — vedi il preambolo per il perché.
 */
export const ORIGIN_PROPRIE: ReadonlySet<string> = new Set([
  "tullio-seven.vercel.app",
  "tullio-tooco-s-projects.vercel.app",
  "tullio-git-main-tooco-s-projects.vercel.app",
]);

/** L'hostname di una URL in minuscolo, o null se non è una URL https valida. */
function hostHttps(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let u: URL;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== "https:") return null;
  return u.hostname.toLowerCase();
}

/**
 * Per l'header CORS: l'Origin appartiene al progetto?
 *
 * Il rischio qui è il più basso dei due — gli endpoint sono Bearer-authed e il
 * token vive in `localStorage`, che è scoped per origine: un sito terzo non
 * può ottenerlo, quindi non può nemmeno formulare una richiesta autorizzata di
 * cui gli servirebbe leggere la risposta. Resta comunque un elenco esatto: una
 * regola più larga qui e una più stretta là sarebbe una differenza da
 * ricordare, e questo file esiste perché non ce ne siano.
 */
export function originConsentita(origin: unknown): boolean {
  const host = hostHttps(origin);
  return host !== null && ORIGIN_PROPRIE.has(host);
}

/**
 * Per `redirectTo` degli inviti: è un URL a cui è lecito consegnare i token?
 *
 * È lo STESSO insieme di `originConsentita`, e la funzione è separata per una
 * ragione di leggibilità e non di comportamento: i due call site rispondono a
 * due domande diverse — «chi può leggere questa risposta» e «dove può atterrare
 * una sessione» — e la seconda è quella che, se sbagliata, consegna un token a
 * un terzo (C-1). Tenerle distinte rende esplicito che se un giorno una delle
 * due dovesse allargarsi, l'altra non la segue per inerzia.
 *
 * Ritorna la stringa ORIGINALE (non normalizzata): è ciò che va passato a
 * `inviteUserByEmail`, che vuole la URL completa di path. `undefined` significa
 * «non passare `redirectTo`», e GoTrue ripiega sul Site URL — la degradazione
 * corretta, non un errore.
 */
export function redirectConsentito(value: unknown): string | undefined {
  const host = hostHttps(value);
  if (host === null || !ORIGIN_PROPRIE.has(host)) return undefined;
  return value as string;
}
