// src/lib/api/storage.js
// Bucket privati: signed URL con cache, e la normalizzazione di nome
// file e MIME type che chat e allegati task condividono.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { getSupabase } from '../supabase';

// Cache delle signed URL degli avatar. Separata da quella degli allegati
// (signedUrlCache, subito sotto) perché ha una frequenza d'uso diversa: un
// avatar è richiesto da decine di componenti nello stesso render, quindi
// senza cache si genererebbe una richiesta per ogni <Avatar> montato.
export const avatarUrlCache = new Map();
// Cache condivisa dagli allegati di chat e di task (Messages.getFileUrl,
// TaskFiles.getFileUrl): stessa pressione d'uso — un click alla volta —
// quindi le due si accontentano di una Map sola, a differenza degli avatar.
export const signedUrlCache = new Map();

// Signed URL con cache in memoria, per i tre bucket privati (M-3 dell'audit
// del 14 agosto). Prima era lo stesso corpo scritto tre volte — qui, in
// Messages.getFileUrl e in TaskFiles.getFileUrl — differendo solo per il nome
// del bucket: un fix al TTL o all'invalidazione ne avrebbe raggiunta una sola
// delle tre per distrazione, non per scelta.
//
// Il MARGINE fra il TTL richiesto e la scadenza salvata in cache è
// l'invariante che questa funzione esiste per rendere esplicito: la URL si
// considera scaduta cinque minuti PRIMA che il server la rifiuti, così un
// click che parte poco prima della scadenza non riceve un 400 dal bucket.
// Finché la coppia era scritta a mano in tre punti (`60 * 60` e
// `55 * 60 * 1000`), il margine non era una regola: era una coincidenza fra
// sei numeri che nessuno dei tre call site dichiarava di voler mantenere.
const TTL_SIGNED_URL_S = 60 * 60;
const MARGINE_SCADENZA_MS = 5 * 60 * 1000;

export const creaSignedUrlGetter = (bucket, cache) => async (path) => {
  if (!path) return { url: null, error: null };
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return { url: cached.url, error: null };
  const supabase = await getSupabase();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SIGNED_URL_S);
  const url = data?.signedUrl ?? null;
  if (url) cache.set(path, { url, expiresAt: Date.now() + TTL_SIGNED_URL_S * 1000 - MARGINE_SCADENZA_MS });
  return { url, error };
};

// Bucket fisso: l'unico dei tre call site che ha bisogno di RICORDARE quale
// bucket usa, perché getAvatarUrl lo richiama al posto di ripetere
// 'avatars' — Messages/TaskFiles passano invece il proprio bucket in linea,
// visto che ciascuna entry lo dichiara una volta sola.
export const avatarSignedUrl = creaSignedUrlGetter('avatars', avatarUrlCache);

// Step M: i nomi file possono contenere caratteri non ammessi nelle key
// di Storage (spazi, accenti) → normalizzo mantenendo estensione leggibile.
export const sanitizeFileName = (name = 'file') => name.replace(/[^\w.-]+/g, '_');

// Tipo MIME senza parametri: "audio/webm;codecs=opus" → "audio/webm",
// "text/plain;charset=utf-8" → "text/plain". Da quando i bucket hanno una
// allowed_mime_types (migrazione 20260806160000) il confronto è sulla stringa
// esatta, e un parametro attaccato fa rifiutare un upload per il resto
// legittimo. Il fallback octet-stream è nell'elenco consentito apposta: è ciò
// che il browser manda quando il sistema operativo non riconosce l'estensione.
export const baseMimeType = (tipo) => (tipo || '').split(';')[0].trim() || 'application/octet-stream';
