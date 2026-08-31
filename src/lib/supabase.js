// src/lib/supabase.js
// Client Supabase pieno (postgrest + realtime + storage + functions) — B-2
// dell'audit del 30 agosto, secondo passo.
//
// PERCHÉ getSupabase() E NON PIÙ `export const supabase = createClient(...)`.
// Il primo passo di B-2 aveva tolto l'auth di questo file dal percorso
// anonimo (vedi lib/supabaseAuth.js), ma non era bastato: `AuthGate.jsx`
// avvia il download di VoyageDesk.jsx INCONDIZIONATAMENTE a ogni caricamento
// (B-1 dell'audit del 16 agosto — per non far attendere l'utente già
// autenticato, il caso più comune), e VoyageDesk arriva fino a `lib/api.js`,
// che fino a qui importava `{ supabase }` da QUESTO file in cima a dieci
// moduli. Un `import { createClient } from '@supabase/supabase-js'` STATICO
// qui dentro — anche se `createClient()` non viene mai chiamato da chi legge
// solo il nome — basta perché Rollup lo includa nel grafo statico
// dell'entry, e da lì nel `modulepreload` che il browser scarica per OGNI
// visitatore, autenticato o no. Misurato: lo split di lib/supabaseAuth.js da
// solo non spostava questo numero di un byte.
//
// `@supabase/supabase-js` è ora dietro un `import()` DINAMICO, innescato solo
// dalla prima chiamata reale a una funzione del data layer (che richiede
// comunque una sessione valida per avere senso — nessuna query passa le
// policy RLS senza). Chi resta sulla schermata di login non la scarica mai.
//
// COSA RESTA UGUALE PER CHI CHIAMA. `lib/api/*.js` (e lib/realtime.js,
// components/liste/listeApi.js) fanno `const supabase = await getSupabase();`
// una volta per funzione esportata, poi usano `supabase` esattamente come
// prima — sincrono per il resto del corpo. Nessun cambiamento nella FORMA
// delle query, solo in COME si ottiene il client con cui farle.
//
// Singleton memoizzato: la prima chiamata innesca `import()` + `createClient()`,
// tutte le chiamate concorrenti successive (anche prima che la prima sia
// risolta) condividono la STESSA promise — mai due client costruiti.
import { supabaseAuth } from './supabaseAuth.js';

// ─── Un solo proprietario della sessione ───────────────────────────────────
// («permission denied for table tasks/notices/message_templates» del 31 agosto)
//
// COSA SI ROMPEVA. Questo client veniva costruito con `auth: { persistSession:
// true, autoRefreshToken: false }`: cioè con un PROPRIO GoTrueClient, che
// leggeva la sessione dalla stessa storageKey di lib/supabaseAuth.js. Due
// istanze gotrue vive nella stessa scheda, e al ritorno da un periodo di
// inattività si sono trovate a rinfrescare LO STESSO refresh token nello
// stesso istante (due POST /auth/v1/token?grant_type=refresh_token a 178 ms
// di distanza, entrambe 200). auth-js protegge la rotazione con un "commit
// guard": chi arriva secondo si accorge che lo slot di storage è cambiato
// sotto di lui e SCARTA i token appena ottenuti, restituendo
// `{ session: null, error: AuthRefreshDiscardedError }` — corretto come
// difesa, ma il chiamante era `_getAccessToken()` di supabase-js, che davanti
// a una sessione nulla NON fallisce: ricade sulla anon key
// (`data.session?.access_token ?? this.supabaseKey`). Le richieste partivano
// quindi come ruolo `anon`, che dalla migrazione
// 20260806170000_revoke_anon_table_grants non ha più alcun GRANT: PostgREST
// rispondeva 401 e Postgres registrava «permission denied for table …» per
// ogni tabella dell'idratazione. La sessione buona ERA nello storage, scritta
// dal vincitore del refresh un attimo prima: solo le chiamate con un retry
// (caricaProfilo in auth/AuthContext.jsx) si riprendevano da sole, mentre le
// query dell'idratazione — a colpo singolo — restituivano un errore e un
// toast rosso a testa.
//
// COSA FA ORA. L'opzione `accessToken` di supabase-js sostituisce del tutto
// l'auth interna del client pieno (`supabase.auth` diventa un proxy che
// solleva se qualcuno prova a usarlo, e supabase-js non registra il proprio
// listener di eventi auth): l'unico GoTrueClient dell'app resta quello di
// lib/supabaseAuth.js, che era già l'unico a fare refresh proattivo e URL
// detection. Niente più due istanze sulla stessa storageKey, quindi niente
// più refresh concorrenti da cui uscire perdenti. postgrest, storage,
// functions e realtime chiedono il token a questa funzione a ogni richiesta
// (realtime anche a ogni heartbeat), quindi dopo un refresh viaggiano tutti
// con il token nuovo senza bisogno di essere avvisati.
//
// PERCHÉ UN SECONDO TENTATIVO. Il commit guard può ancora far perdere una
// chiamata quando a rinfrescare è UN'ALTRA SCHEDA dello stesso browser (lì le
// istanze restano due per forza). È però un caso in cui la sessione valida è
// GIÀ nello storage — il guard scatta proprio perché qualcun altro ce l'ha
// appena scritta — e una seconda `getSession()` la trova senza nessuna
// attesa. Due tentativi bastano: il secondo non è "riprova e spera", è la
// rilettura di un dato che nel frattempo è arrivato.
const TENTATIVI_TOKEN = 2;

export function creaLettoreToken(auth, tentativi = TENTATIVI_TOKEN) {
  return async function leggiToken() {
    let ultimoErrore = null;
    for (let tentativo = 1; tentativo <= tentativi; tentativo++) {
      // getSession() rilegge lo storage a ogni chiamata e, se il token è
      // scaduto, lo rinfresca da sé (auth-js lo fa anche con
      // autoRefreshToken spento, vedi __loadSession): è la fonte di verità,
      // non una cache da tenere allineata.
      const { data, error } = await auth.getSession();
      const token = data?.session?.access_token;
      if (token) return token;
      ultimoErrore = error;
    }
    // Mai un fallback silenzioso sulla anon key: senza GRANT il database
    // risponderebbe «permission denied for table …», un messaggio che parla
    // di privilegi mentre il guasto è la sessione. Meglio fallire qui,
    // dicendo cosa è successo davvero e cosa può fare l'utente. Il `name`
    // finisce nel messaggio d'errore che postgrest-js consegna al chiamante
    // (`${name}: ${message}`), quindi i due pezzi si leggono come una frase.
    const err = new Error('ricarica la pagina per rientrare.', ultimoErrore ? { cause: ultimoErrore } : undefined);
    err.name = 'Sessione assente';
    throw err;
  };
}

let clientPromise = null;

async function creaClient() {
  const { createClient } = await import('@supabase/supabase-js');

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error(
      '[VoyageDesk] Mancano VITE_SUPABASE_URL e/o VITE_SUPABASE_ANON_KEY. ' +
      'Creale in .env (locale) e nelle env vars di Vercel.'
    );
  }

  // Nessun blocco `auth`: con `accessToken` questo client non ha più
  // un'istanza gotrue propria (vedi il preambolo qui sopra). Chi ha bisogno
  // di un'operazione di autenticazione — login, logout, refreshSession,
  // updateUser — usa `supabaseAuth` di lib/supabaseAuth.js.
  return createClient(url, key, {
    accessToken: creaLettoreToken(supabaseAuth),
  });
}

export function getSupabase() {
  if (!clientPromise) clientPromise = creaClient();
  return clientPromise;
}
