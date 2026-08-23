// src/lib/realtime.js
// Il TRANSPORT realtime: i canali, la loro identità e il filtro dell'eco.
//
// PERCHÉ È USCITO DA lib/api.js (A-4 dell'audit del 23 agosto, secondo
// passaggio). Quel file teneva insieme due livelli diversi: tredici namespace
// di dominio, che dicono QUALI righe leggere e scrivere, e questo, che dice
// COME arrivano gli aggiornamenti — nomi di canale, ciclo di vita delle
// sottoscrizioni, presence, broadcast. Sono due assi che cambiano per ragioni
// indipendenti: si aggiunge un'entità senza toccare i canali, e il naming dei
// canali (il `channelSeq` qui sotto) è cambiato senza toccare un'entità.
//
// La ragione decisiva però non è la dimensione, è che il contratto di
// `origin_client` era SPEZZATO FRA I DUE CAPI DELLO STESSO FILE: chi mette il
// tag (`withOrigin`, in cima) e chi lo legge per scartare l'eco
// (`subscribeToTable`, mille righe più sotto) sono le due metà di una regola
// sola, e per capire l'una bisognava aver già letto l'altra. Ora sono
// contigue, ed è il motivo per cui `withOrigin` sta qui e non è rimasto fra le
// query che lo usano: appartiene al protocollo, non alle scritture.
//
// L'INGRESSO PER I CONSUMATORI RESTA `lib/api.js`, che ri-esporta le tre
// `subscribeTo*`. Non è un residuo: il data layer ha una porta sola, e sono i
// test a rendere la cosa concreta — ventiquattro file sostituiscono
// `lib/api.js` con un doppio, e con due moduli da sostituire ognuno di essi
// potrebbe essere giusto su una metà e sbagliato sull'altra senza che nulla lo
// segnali. Qui c'è l'implementazione e il perché; là c'è la porta.
import { supabase } from './supabase';
import { getClientId } from './clientId';

// Step L: allega l'origin client a ogni payload di mutation sulle tabelle
// live. I subscriber realtime usano questo tag per scartare gli eventi che
// hanno generato loro stessi.
//
// Il tag funziona SOLO se la tabella ha davvero la colonna `origin_client`:
// altrimenti PostgREST rifiuta la scrittura con PGRST204. La colonna c'è su
// tasks, notices, conversations, messages, comments, users, categories,
// notifications e — dalla migrazione 20260808120000 — clients e task_history.
// Le tabelle del modulo Liste (liste_viaggio, movimenti_lista) sono in
// realtime ma NON hanno la colonna: le loro scritture passano tutte da RPC e
// non sono taggate (vedi il blocco (b) della stessa migrazione). L'invariante
// «pubblicata su realtime ⇒ ha origin_client» è misurata da
// src/test/realtimeOriginContract.test.js.
export const withOrigin = (payload) => ({ ...payload, origin_client: getClientId() });

// Step L: i payload realtime hanno origin_client se generati da una mutation
// taggata: su INSERT/UPDATE sta in payload.new, su DELETE in payload.old (solo
// dove la tabella è a REPLICA IDENTITY FULL, vedi migration
// 20260611_replica_identity_full.sql). Se il tag coincide con il nostro
// client, l'evento è l'eco della nostra stessa scrittura — l'UI è già
// aggiornata in modo ottimistico, quindi lo scartiamo per evitare flash.
//
// Su DELETE l'origine NON è affidabile e infatti non viene più letta.
// `.delete()` non trasporta un payload, quindi `payload.old.origin_client` non
// è l'origine di CHI CANCELLA: è quella dell'ultima scrittura che ha toccato
// la riga. Fidarsene invertiva il senso del filtro proprio per l'utente più
// coinvolto —
//
//   A modifica un task (origin = A) → B lo purga dal cestino → l'evento DELETE
//   arriva ad A con origin = A → A lo scarta come eco propria → nella lista di
//   A quel task resta, e resta finché A non ricarica la pagina.
//
// — sulle sette tabelle a REPLICA IDENTITY FULL, `tasks` compresa. Ignorando
// l'origine sui DELETE ogni cancellazione provoca un refetch: una richiesta in
// più, sempre corretta. Non è una perdita, perché l'eco della PROPRIA DELETE
// non era comunque filtrabile (non porta il tag), quindi il ramo scartava solo
// cancellazioni altrui. Vedi il blocco (a) della migrazione 20260808120000,
// che per la stessa ragione NON ha portato a FULL le tabelle nuove.
// Contatore monotono per generare topic di canale UNIVOCI a ogni chiamata.
// Più subscriber possono ascoltare la STESSA tabella: `users`, ad esempio, è
// osservata sia dal refresh team sia dalla presence. Con un topic fisso
// `realtime:<table>` supabase-js riusa il canale già sottoscritto e il secondo
// `.on('postgres_changes')` lancia "cannot add postgres_changes callbacks for
// realtime:realtime:<table> after subscribe()" (pagina bianca al mount). Un
// suffisso univoco dà a ogni subscriber il proprio canale indipendente, con lo
// stesso filtro postgres → entrambi ricevono gli eventi della tabella.
let channelSeq = 0;

export function subscribeToTable(tableName, handler) {
  // Client non utilizzabile (env var assenti, o mockato nei test): il realtime
  // è un miglioramento, non un requisito di funzionamento. Degradiamo a "nessun
  // aggiornamento automatico" invece di sollevare dentro un useEffect, dove
  // l'eccezione risalirebbe fino all'ErrorBoundary e mostrerebbe una pagina
  // bianca al posto di una vista che i dati li ha già caricati.
  if (typeof supabase?.channel !== "function") {
    return () => {};
  }
  const channel = supabase
    .channel(`realtime:${tableName}:${getClientId()}:${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload) => {
      // Solo INSERT/UPDATE possono portare un'origine attendibile: sono le sole
      // che passano da un payload nostro (withOrigin). Sui DELETE l'origine si
      // ignora — vedi la nota sopra: è quella dell'ultima scrittura, non del
      // cancellante, e filtrarci sopra nascondeva la cancellazione a chi aveva
      // toccato la riga per ultimo.
      if (payload?.eventType !== 'DELETE') {
        const origin = payload?.new?.origin_client;
        if (origin && origin === getClientId()) return;
      }
      handler(payload);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ─── A-3 · LA PRESENZA È STATO DI CANALE, NON UNA RIGA DI TABELLA ──────────
// (audit performance/UX del 19 agosto)
//
// Era una `UPDATE` su `public.users` ogni 30 secondi per sessione. Quella
// tabella è nella publication `supabase_realtime` ed è a `REPLICA IDENTITY
// FULL`, quindi ogni battito diventava un evento — con la riga intera vecchia
// E nuova — consegnato a OGNI client sottoscritto a `users`; e ogni sessione
// la sottoscriveva due volte (il refresh del team e la presenza stessa). Con U
// sessioni contemporanee il traffico era U²/15 messaggi al secondo: ~2,1
// milioni al mese con le sette persone di oggi, ~26 con venticinque, in una
// giornata in cui nessuno tocca una task. Il filtro `filterEvent` in
// `useAppHydration` scartava quegli eventi, ma nel BROWSER — dopo che erano
// stati consegnati.
//
// Realtime Presence tiene lo stato NEL CANALE: `track()` non scrive niente sul
// database, non passa dal WAL, non fa valutare una policy RLS per riga, e alla
// disconnessione la voce si ritira da sola — che è il pezzo che un heartbeat
// su tabella non ha mai avuto (un browser ucciso senza `beforeunload` lasciava
// `status='online'` finché il tempo non lo faceva invecchiare).
//
// È lo stesso meccanismo di `subscribeToTyping` qui sotto, e per la stessa
// ragione: uno stato vero finché i client sono connessi non va persistito.
// Quello che ancora si scrive su `users` — e che il canale non può dare — è
// «quando questa persona ha aperto l'app l'ultima volta», che il pannello
// Admin mostra: resta una `setPresence` all'avvio della sessione, una al
// cambio di «Occupato» e una alla chiusura, cioè tre per sessione invece di
// una ogni trenta secondi.
//
// Un topic solo per tutta l'agenzia: la presenza è una lista di chi c'è, e
// dividerla per conversazione (come il typing) significherebbe non sapere chi
// è online finché non gli si apre una chat.
const CANALE_PRESENZA = 'presenza:agenzia';

/**
 * Apre il canale di presenza e ci pubblica il proprio stato.
 *
 * @param {object} opts
 * @param {string} opts.key           id dell'utente: è la chiave con cui le
 *   proprie voci si raggruppano in `presenceState()` (più schede aperte = più
 *   voci sotto la stessa chiave).
 * @param {() => object} opts.payload  lo stato da pubblicare, letto AL MOMENTO
 *   della pubblicazione e non catturato: `track` parte anche da un timer e da
 *   `visibilitychange`, cioè dopo che il chiamante ha cambiato idea.
 * @param {(stato: object) => void} opts.onSync  riceve `presenceState()` grezzo
 *   a ogni sincronizzazione; la traduzione è `daStatoCanale` in lib/presenza.js.
 * @returns {{ track: () => void, unsubscribe: () => void }}
 */
export function subscribeToPresence({ key, payload, onSync }) {
  // Stessa degradazione di `subscribeToTable`: senza client utilizzabile
  // (env var assenti, o mockato nei test) la presenza è un miglioramento, non
  // un requisito — si resta senza pallini invece di sollevare dentro un
  // useEffect e mostrare una pagina bianca.
  if (typeof supabase?.channel !== 'function') {
    return { track: () => {}, unsubscribe: () => {} };
  }
  const channel = supabase.channel(CANALE_PRESENZA, {
    config: { presence: { key } },
  });
  channel
    .on('presence', { event: 'sync' }, () => onSync(channel.presenceState()))
    .subscribe((stato) => {
      // La prima pubblicazione va fatta DA QUI e non subito dopo `subscribe()`:
      // `track()` su un canale non ancora agganciato viene rifiutato, e il
      // proprio pallino resterebbe spento per tutti gli altri finché il primo
      // refresh periodico non arriva.
      if (stato === 'SUBSCRIBED') channel.track(payload());
    });
  return {
    track: () => channel.track(payload()),
    unsubscribe: () => supabase.removeChannel(channel),
  };
}

// Canale realtime di BROADCAST per lo stato EFFIMERO "sta scrivendo".
// A differenza di subscribeToTable non tocca il DB: gli eventi vivono solo
// finché i client sono connessi (il typing non va persistito). Topic dedicato
// per-conversazione così ogni chat ha il suo canale isolato.
//   { config: { broadcast: { self: false } } } → il mittente NON riceve l'eco
//   dei propri eventi, quindi non serve filtrare il proprio userId in ricezione.
// Ritorna { send, unsubscribe }; send(payload) pubblica un evento 'typing'.
export function subscribeToTyping(conversationId, onEvent) {
  const channel = supabase
    .channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, ({ payload }) => onEvent(payload))
    .subscribe();
  const send = (payload) =>
    channel.send({ type: 'broadcast', event: 'typing', payload });
  const unsubscribe = () => supabase.removeChannel(channel);
  return { send, unsubscribe };
}
