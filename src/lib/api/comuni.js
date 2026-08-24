// src/lib/api/comuni.js
// Helper condivisi da tutti i moduli del data layer: normalizzazione
// degli errori, invocazione delle Edge Function, conteggio righe.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { supabase } from '../supabase';

// Normalizza un errore (stringa, oggetto Error, oggetto serializzato) in un
// testo sempre mostrabile. Evita il bug per cui un Error serializzato via
// JSON.stringify diventa "{}" (message/stack sono proprietà non enumerabili)
// e finiva renderizzato così nelle modali. Restituisce sempre una stringa
// non vuota: il messaggio se disponibile, altrimenti il fallback.
export const errText = (v, fallback = 'Operazione non riuscita.') => {
  if (typeof v === 'string' && v.trim()) return v;
  if (v && typeof v === 'object' && typeof v.message === 'string' && v.message.trim()) return v.message;
  return fallback;
};

// Messaggio mostrato quando la sessione lato server non esiste più (tipicamente
// dopo un logout avvenuto altrove). Le Edge Function (verify_jwt + getUser)
// rispondono "Token non valido"/"Non autorizzato": un access-token JWT può
// essere ancora formalmente valido mentre la sessione è già stata revocata.
export const SESSION_EXPIRED_MSG = 'Sessione scaduta. Esci e accedi di nuovo, poi riprova.';
export const isExpiredSessionError = (msg) =>
  typeof msg === 'string' && /token non valido|session.?not.?found|non autorizzato/i.test(msg);

// Invoca una Edge Function e normalizza sempre il risultato in
// { data, error: { message } }. Supabase-js mette il corpo JSON della risposta
// d'errore (status non-2xx) in error.context: lo estraiamo per esporre il
// messaggio localizzato dalla funzione invece del generico "Edge Function
// returned a non-2xx status code". Alcune funzioni ritornano { error } anche
// con status 2xx: lo trattiamo come errore. Un tempo questo blocco era
// copia-incollato in invite/deleteAccount/deleteUser.
export const invokeFn = async (name, body = {}, fallback = 'Operazione non riuscita.') => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = errText(error.message, fallback);
    try {
      const b = await error.context?.json?.();
      if (b?.error) msg = errText(b.error, msg);
    } catch { /* body non-JSON: usa error.message */ }
    return { data: null, error: { message: msg } };
  }
  if (data?.error) return { data: null, error: { message: errText(data.error, fallback) } };
  return { data, error: null };
};

// righe una UPDATE/DELETE ha DAVVERO toccato.
//
// Serve a distinguere "riuscita" da "rifiutata dalla RLS", che senza questo
// sono la stessa risposta: la clausola USING di una policy non solleva un
// errore, rende le righe invisibili — e una UPDATE/DELETE su zero righe è
// indistinguibile da una su un id inesistente. `res.error` resta null in
// entrambi i casi.
//
// Va aggiunta SOLO ai metodi che mirano a UNA riga già esistente per chiave
// primaria (.eq('id', …) o equivalente): lì `count === 0` significa "il
// database non me l'ha lasciata toccare". Non va aggiunta alle scritture che
// possono legittimamente non toccare nulla (markAllRead su zero non lette,
// hardDeleteMany su un cestino vuoto): là zero è un esito normale, non un
// rifiuto. useSyncedDispatch (hooks/useSyncedDispatch.js) legge `count` solo
// dove il metodo lo fornisce: l'adozione è per-metodo, non tutto-o-niente.
export const CONTA_RIGHE = { count: 'exact' };
