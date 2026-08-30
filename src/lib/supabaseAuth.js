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
// COESISTENZA COL CLIENT PIENO (lib/supabase.js). GoTrueClient è progettato
// per avere PIÙ istanze attive sulla stessa storageKey: è lo stesso
// meccanismo che tiene sincronizzate due schede dello stesso browser — legge/
// scrive la sessione da `storage`, ascolta gli eventi `storage` per accorgersi
// di cambi fatti da un'altra istanza, e usa `navigator.locks` (lock nominato
// sulla storageKey) per serializzare i refresh del token fra istanze
// concorrenti. Da quando VoyageDesk monta (post-login) questa istanza resta
// comunque viva finché AuthProvider è montato — cioè per tutta la sessione —
// accanto al client pieno: due istanze nella stessa scheda, non uno scenario
// nuovo per gotrue, ma non è la STESSA cosa di due schede reali, e non è
// stato validato qui con un progetto Supabase live (nessun ambiente di rete
// reale in questa sessione di sviluppo). Per restare comunque sul lato
// prudente, questo modulo è l'UNICA istanza che fa refresh proattivo e legge
// l'hash dell'URL: lib/supabase.js disattiva `autoRefreshToken` e
// `detectSessionInUrl` sulla propria — vedi il commento lì.
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
// storage). DEVE combaciare byte per byte con quella che produce
// `createClient()` per lib/supabase.js, altrimenti le due istanze
// scriverebbero la sessione in due chiavi diverse e smetterebbero di vedersi
// — vedi src/test/lib/supabaseAuth.test.js, che confronta questa derivazione
// con quella osservabile del client pieno.
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
