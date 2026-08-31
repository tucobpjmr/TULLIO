// src/lib/supabaseAuth.js
// Client di SOLA autenticazione — B-2 dell'audit del 30 agosto.
//
// PERCHÉ ESISTE. `createClient()` di @supabase/supabase-js istanzia SEMPRE,
// nel proprio costruttore, anche RealtimeClient/PostgrestClient/StorageClient
// — anche se nessuno dei tre viene mai chiamato (vedi SupabaseClient.ts:
// `this.realtime = …`, `this.rest = new PostgrestClient(…)`,
// `this.storage = new StorageClient(…)` sono tutte nel costruttore, non
// dietro un getter pigro). In più il pacchetto è pubblicato come un unico
// bundle PRE-ASSEMBLATO (i sotto-pacchetti sono già inglobati dentro
// dist/index.mjs al momento della pubblicazione, non importati come moduli
// separati): Vite non può "tagliarlo" con manualChunks, perché al momento in
// cui il nostro build lo vede è già un blob solo. Sulla schermata di login
// questo scarica il motore realtime (websocket) per mostrare due campi e un
// bottone — 54,46 kB gzip, più di React, anche sul percorso ANONIMO dove
// serve solo l'autenticazione.
//
// PERCHÉ È SICURO ISTANZIARE UN SECONDO CLIENT. Non è un'implementazione
// alternativa da tenere sincronizzata a mano: `supabase.auth` (il client
// pieno di lib/supabase.js) È letteralmente `new GoTrueClient(opzioni)` sotto
// un altro nome — `SupabaseAuthClient` in @supabase/supabase-js è
// `class SupabaseAuthClient extends AuthClient {}`, e `AuthClient` è
// `GoTrueClient` (stesso riferimento di classe: verificato su
// @supabase/auth-js@2.108.0, la stessa versione che @supabase/supabase-js
// dichiara come dipendenza). Costruendo QUI lo stesso GoTrueClient con le
// STESSE opzioni — stessa storageKey, stessi header, stesso URL — si ottiene
// un'istanza indistinguibile da `supabase.auth`, non un client "diverso".
//
// COESISTENZA COL CLIENT PIENO (lib/supabase.js). Questa è l'UNICA istanza
// gotrue dell'app. Il client pieno ne aveva una propria — stessa storageKey,
// `autoRefreshToken` spento — nella convinzione che due istanze sulla stessa
// chiave fossero lo scenario, già previsto da gotrue, di due schede dello
// stesso browser. Il 31 agosto quella convinzione ha presentato il conto: al
// rientro dopo un'inattività le due istanze hanno rinfrescato lo STESSO
// refresh token nello stesso istante, il commit guard di auth-js ha scartato
// i token della seconda (comportamento corretto: la rotazione non si applica
// due volte) e supabase-js, davanti alla sessione nulla che ne è risultata, è
// ricaduto in silenzio sulla anon key — che dalla migrazione
// 20260806170000_revoke_anon_table_grants non ha GRANT su nulla. Undici
// tabelle e una vista dell'idratazione hanno risposto «permission denied
// for table …» a un utente regolarmente autenticato. `autoRefreshToken:
// false` non bastava a evitarlo, perché `getSession()` rinfresca comunque
// quando il token è scaduto: a rinfrescare erano in due anche con il
// refresh proattivo spento su una.
//
// Ora il client pieno non ha più alcuna istanza gotrue: chiede il token a
// QUESTA, a ogni richiesta, tramite l'opzione `accessToken` di supabase-js
// (vedi il preambolo di lib/supabase.js). Restano due istanze solo fra schede
// diverse, che è il caso per cui gotrue è progettato — e lì il lettore di
// token del client pieno rilegge la sessione una seconda volta invece di
// degradare ad anon.
//
// Questo file NON deve importare '../lib/supabase.js' né '@supabase/supabase-js':
// l'intero motivo per cui esiste è restare fuori dal grafo che li porta con
// sé. Se un domani ti serve qui una query, la risposta è "non qui" — vedi
// caricaProfilo in auth/AuthContext.jsx per il pattern (import dinamico del
// client pieno, solo quando una sessione è già confermata).
import { GoTrueClient } from '@supabase/auth-js';

// Stessa derivazione di authUrl/storageKey che @supabase/supabase-js usa
// internamente (SupabaseClient.ts: `ensureTrailingSlash` + `new URL('auth/v1',
// baseUrl)` per l'URL, `sb-<primo-segmento-host>-auth-token` per la chiave di
// storage). DEVE restare byte per byte quella che `createClient()` produce:
// è la chiave sotto cui vivono le sessioni già persistite nei browser degli
// utenti (scritte quando il client pieno aveva ancora un'auth propria) e
// quella che qualsiasi client supabase-js futuro andrebbe a cercare. Cambiarla
// non darebbe un errore: darebbe un logout silenzioso per tutti — vedi
// src/test/lib/supabaseAuth.test.js, che pinna la formula.
//
// Esportate come funzioni pure (non lette da proprietà interne di
// GoTrueClient, che non sono API pubbliche e possono cambiare nome a ogni
// versione) così il test può verificarle senza costruire un client vero.
export function deriveAuthUrl(supabaseUrl) {
  if (!supabaseUrl) return undefined;
  const baseUrl = new URL(supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`);
  return new URL('auth/v1', baseUrl).href;
}

export function deriveStorageKey(supabaseUrl) {
  if (!supabaseUrl) return undefined;
  const baseUrl = new URL(supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`);
  return `sb-${baseUrl.hostname.split('.')[0]}-auth-token`;
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    '[VoyageDesk] Mancano VITE_SUPABASE_URL e/o VITE_SUPABASE_ANON_KEY. ' +
    'Creale in .env (locale) e nelle env vars di Vercel.'
  );
}

export const supabaseAuth = new GoTrueClient({
  url: deriveAuthUrl(url),
  headers: { Authorization: `Bearer ${key}`, apikey: `${key}` },
  storageKey: deriveStorageKey(url),
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
});

export default supabaseAuth;
