// src/lib/realtime.js
// Il TRANSPORT realtime: i canali, la loro identità e il filtro dell'eco.
// Chi mette il tag `origin_client` (`withOrigin`) e chi lo legge per scartare
// l'eco (`subscribeToTable`) sono le due metà di una regola: stanno insieme.
// L'ingresso per i consumatori resta `lib/api.js`, che ri-esporta le
// `subscribeTo*`: il data layer ha una porta sola (anche per i test).
import { getSupabase } from './supabase';
import { getClientId } from './clientId';

// B-2 · Le `subscribeTo*` hanno un contratto SINCRONO (stop = subscribe…),
// ma `getSupabase()` è asincrono: il client si risolve in background e un
// flag `smontato` evita di agganciare un canale a un componente già smontato.

// Allega l'origin client a ogni mutation sulle tabelle live: i subscriber
// scartano gli eventi generati da loro stessi.
// ⚠️ Solo sulle tabelle con la colonna `origin_client` (altrimenti PGRST204).
// Le tabelle delle Liste non l'hanno: scrivono via RPC. L'invariante
// «pubblicata su realtime ⇒ ha origin_client» è misurata da
// src/test/realtimeOriginContract.test.js.
export const withOrigin = (payload) => ({ ...payload, origin_client: getClientId() });

// Eco della propria scrittura: tag uguale al nostro client → si scarta.
// ⚠️ Sui DELETE l'origine NON si legge: `payload.old.origin_client` è quella
// dell'ultima scrittura sulla riga, non di chi cancella. Fidarsene nascondeva
// la cancellazione proprio a chi aveva toccato la riga per ultimo. Ogni DELETE
// fa quindi un refetch (vedi la migrazione 20260808120000, blocco (a)).
//
// Contatore per topic di canale UNIVOCI: più subscriber ascoltano la stessa
// tabella (`users`), e con un topic fisso supabase-js riuserebbe il canale e
// il secondo `.on()` lancerebbe (pagina bianca).
let channelSeq = 0;

/**
 * @param {string}   tableName
 * @param {(payload: object) => void} handler
 * @param {(stato: string) => void} [onStato]  riceve OGNI transizione del
 *   canale ('SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED').
 *
 * A-1 · Senza lo stato del canale, un websocket morto si vede solo come
 * ASSENZA di eventi, cioè come un pomeriggio tranquillo: `OfflineBanner`
 * tace e si lavora su numeri fermi. Opzionale per `subscribeToTyping`, il
 * cui stato effimero può degradare in silenzio.
 */
export function subscribeToTable(tableName, handler, onStato) {
  let smontato = false;
  let staccaCanale = () => {};
  getSupabase().then((supabase) => {
    if (smontato) return;
    // Client non utilizzabile (env assenti, mock nei test): il realtime è un
    // miglioramento, si degrada senza sollevare.
    // ⚠️ E non si segnala nulla a `onStato`: non c'è un canale caduto, c'è una
    // configurazione.
    if (typeof supabase?.channel !== "function") return;
    const channel = supabase
      .channel(`realtime:${tableName}:${getClientId()}:${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload) => {
        // Solo INSERT/UPDATE portano un'origine attendibile (vedi sopra).
        if (payload?.eventType !== 'DELETE') {
          const origin = payload?.new?.origin_client;
          if (origin && origin === getClientId()) return;
        }
        handler(payload);
      })
      .subscribe((stato, err) => {
        // In console la diagnosi per canale; a schermo il fatto aggregato
        // (lib/freschezzaRealtime.js).
        if (err) console.error(`[VoyageDesk] canale ${tableName} (${stato}):`, err);
        // supabase-js può consegnare un 'CLOSED' dopo `removeChannel`: si ignora.
        if (smontato) return;
        onStato?.(stato);
      });
    staccaCanale = () => supabase.removeChannel(channel);
  });
  return () => { smontato = true; staccaCanale(); };
}

// ─── A-3 · LA PRESENZA È STATO DI CANALE, NON UNA RIGA DI TABELLA ──────────
// ⛔ Niente heartbeat su `users`: ogni battito era un evento consegnato a ogni
// client (traffico quadratico nel numero di sessioni). Realtime Presence tiene
// lo stato nel canale, senza WAL né RLS per riga, e alla disconnessione la
// voce si ritira da sola. Su `users` resta solo «ultimo accesso»: tre
// scritture per sessione.
// Un topic solo per l'agenzia: la presenza è la lista di chi c'è.
const CANALE_PRESENZA = 'presenza:agenzia';

// ─── M-3 del 4 novembre · presenza e «sta scrivendo» sono PRIVATI ───────────
// Su un canale pubblico Realtime non valuta policy: con la sola chiave anon
// chiunque avrebbe letto chi è collegato. `private: true` passa dalle policy
// su `realtime.messages` (migrazione 20261104181351).
// ⚠️ Per ENTRARE in un canale privato serve la lettura `broadcast` sul topic,
// anche per la sola presenza (20261106101314).
// ⛔ Non togliere `private` per «far funzionare» un canale che non si aggancia:
// manca una policy.
const CANALE_PRIVATO = { private: true };

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
  let smontato = false;
  // Prima che il client sia pronto `track`/`unsubscribe` sono no-op: la prima
  // pubblicazione arriva al primo 'SUBSCRIBED'.
  let canale = null;
  let staccaCanale = () => {};

  getSupabase().then((supabase) => {
    if (smontato) return;
    // Senza client utilizzabile: niente pallini, nessuna eccezione.
    if (typeof supabase?.channel !== 'function') return;
    const channel = supabase.channel(CANALE_PRESENZA, {
      config: { ...CANALE_PRIVATO, presence: { key } },
    });
    channel
      .on('presence', { event: 'sync' }, () => onSync(channel.presenceState()))
      .subscribe((stato) => {
        // La prima pubblicazione DA QUI: `track()` su un canale non agganciato viene
        // rifiutato.
        if (stato === 'SUBSCRIBED') channel.track(payload());
      });
    canale = channel;
    staccaCanale = () => supabase.removeChannel(channel);
  });

  return {
    track: () => canale?.track(payload()),
    unsubscribe: () => { smontato = true; staccaCanale(); },
  };
}

// Canale di BROADCAST per lo stato EFFIMERO «sta scrivendo»: non tocca il DB.
// Un topic per conversazione. `broadcast: { self: false }`: il mittente non
// riceve la propria eco. Ritorna { send, unsubscribe }.
export function subscribeToTyping(conversationId, onEvent) {
  let smontato = false;
  // Prima che il client sia pronto `send` è un no-op innocuo.
  let canale = null;
  let staccaCanale = () => {};

  getSupabase().then((supabase) => {
    if (smontato) return;
    const channel = supabase
      .channel(`typing:${conversationId}`, { config: { ...CANALE_PRIVATO, broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => onEvent(payload))
      .subscribe();
    canale = channel;
    staccaCanale = () => supabase.removeChannel(channel);
  });

  const send = (payload) =>
    canale?.send({ type: 'broadcast', event: 'typing', payload });
  const unsubscribe = () => { smontato = true; staccaCanale(); };
  return { send, unsubscribe };
}
