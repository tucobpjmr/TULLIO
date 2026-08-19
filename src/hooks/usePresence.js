// src/hooks/usePresence.js
// Presenza degli utenti: lo stato del canale Realtime (chi c'è ADESSO) sopra
// lo snapshot del team (chi esiste, con nome e colore), in una mappa sola
// { userId → { …riga users, status, last_seen_at } }.
//
// ─── A-3 · COSA È CAMBIATO, E PERCHÉ (audit del 19 agosto) ─────────────────
// C'era un heartbeat: una `UsersAPI.setPresence` ogni 30 secondi, cioè una
// `UPDATE` su `public.users`, che è in realtime ed è a REPLICA IDENTITY FULL.
// Ogni battito diventava un evento consegnato a tutte le sessioni collegate,
// due volte ciascuna (la sottoscrizione del team e questa) — traffico U²/15
// messaggi al secondo, prodotto da un messaggio che diceva «sono ancora qui»
// a un canale già connesso.
//
// Ora la presenza LIVE vive nel canale (`subscribeToPresence` in lib/api.js) e
// non tocca il database. Del vecchio percorso restano tre scritture per
// sessione, e ciascuna ha una ragione che il canale non copre:
//
//   • all'avvio          → `last_seen_at`, cioè «ha aperto l'app»: è ciò che
//                          il pannello Admin mostra per chi NON è collegato
//                          ora, e il canale non lascia traccia;
//   • al toggle Occupato → è un cambio di stato reale, non un battito;
//   • alla chiusura      → `offline`, così la riga non resta 'online' per
//                          sempre in attesa che il tempo la faccia invecchiare.
//
// ⚠️ NON si scrive più su `visibilitychange`: passare in secondo piano è un
// cambio di presenza, e la presenza ora sta nel canale — `track('away')` lo
// pubblica senza toccare il database. Era il caso peggiore del vecchio
// percorso: su mobile lo emettono il commutatore di app, la tendina delle
// notifiche e il selettore di file, più volte in pochi secondi.
//
// ⚠️ E NON c'è più `subscribeToTable("users")` qui: era il SECONDO canale sulla
// stessa tabella per ogni sessione (l'altro è il refresh del team in
// `useAppHydration`), cioè il fattore ×2 del rilievo. Le righe del team
// arrivano da `team`, che quell'altra sottoscrizione tiene già aggiornato.
//
// Il toggle "Occupato" è manuale e vive in ChatPanel: lo teniamo in un ref
// così il canale lo legge senza far ripartire l'intero effetto (che
// ricreerebbe timer e sottoscrizione a ogni click).

import { useState, useRef, useCallback, useEffect } from "react";
import { Users as UsersAPI, subscribeToPresence } from "../lib/api.js";
import { daStatoCanale, REFRESH_PRESENZA_MS } from "../lib/presenza.js";

export function usePresence({ enabled, userId, team }) {
  // Mappa { userId -> rowDB } (per leggere last_seen_at e status).
  const [presenceMap, setPresenceMap] = useState({});
  // Stato "Occupato" manuale: il toggle vive in ChatPanel; lo teniamo in un ref
  // così il canale lo legge senza far ripartire l'effetto presence.
  const [myBusy, setMyBusy] = useState(false);
  const myBusyRef = useRef(false);
  // Ultimo stato pubblicato sul canale ('online' | 'busy' | 'away'), letto da
  // `payload()` al momento della pubblicazione. Un ref e non uno stato: lo
  // legge il canale, non il render, e metterlo nello stato farebbe ripartire
  // l'effetto — cioè chiuderebbe e riaprirebbe il canale — a ogni cambio.
  const statoCanaleRef = useRef('online');
  // La maniglia del canale, per pubblicare da fuori dall'effetto (il toggle
  // "Occupato", che ha il proprio `useCallback`).
  const canaleRef = useRef(null);

  // M-1 dell'audit del 16 agosto. Il nuovo valore si calcola dal REF e le
  // conseguenze (la pubblicazione sul canale, la scrittura su Supabase e
  // l'aggiornamento della mappa di presenza) stanno FUORI dall'updater di
  // `setMyBusy`.
  //
  // Prima erano dentro, ed è la stessa forma che `chatCommands.js` documenta
  // come vietata (⛔ «mai chiamate di rete dentro l'updater di setState»): un
  // updater deve essere PURO perché React 18 può invocarlo più di una volta —
  // StrictMode lo fa di proposito, il Concurrent rendering può scartare un
  // render già calcolato e rigiocare la coda su una base più recente. Con la
  // rete lì dentro, un click su "Occupato" partiva due volte in sviluppo, e in
  // produzione l'aggiornamento della presenza dipendeva da quante volte React
  // avesse scelto di girare.
  const toggleMyBusy = useCallback(() => {
    const nv = !myBusyRef.current;
    myBusyRef.current = nv;
    setMyBusy(nv);
    if (!enabled || !userId) return;
    const st = nv ? 'busy' : 'online';
    statoCanaleRef.current = st;
    // Il canale è il percorso che gli ALTRI vedono, ed è immediato.
    canaleRef.current?.track();
    // A-3 · La scrittura su `users` resta perché «Occupato» è un cambio di
    // stato reale e non un battito: è uno dei tre eventi per sessione che il
    // pannello Admin deve poter leggere anche a sessione chiusa.
    UsersAPI.setPresence(userId, st).then(r => {
      if (r?.error) console.warn("[presence] toggleMyBusy", r.error);
    });
    setPresenceMap(p => ({
      ...p,
      [userId]: { ...(p[userId] || {}), status: st, last_seen_at: new Date().toISOString() },
    }));
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled) return;
    const myId = userId;
    let cancelled = false;
    let refreshTimer = null;

    // Snapshot iniziale di tutti gli utenti.
    // Non passare per UsersAPI.list (filtra active=true): vogliamo tutti gli
    // utenti del team. `team` è già lo snapshot completo — lo tiene aggiornato
    // la sottoscrizione `users` di useAppHydration — e il canale ci scrive
    // sopra chi è collegato adesso.
    const base = {};
    for (const u of team || []) base[u.id] = u;
    setPresenceMap(prev => ({ ...base, ...prev }));

    if (!myId) return;

    // A-3 · Una sola scrittura all'avvio: è il `last_seen_at` che il pannello
    // Admin legge per chi non è collegato ora. Il proprio stato LIVE lo
    // pubblica `track()` dentro subscribeToPresence, senza toccare il database.
    statoCanaleRef.current = myBusyRef.current ? 'busy' : 'online';
    UsersAPI.setPresence(myId, statoCanaleRef.current).then(r => {
      if (cancelled) return;
      if (r?.error) console.warn("[presence] setPresence", r.error);
    });

    const canale = subscribeToPresence({
      key: myId,
      // Letto AL MOMENTO della pubblicazione: `track` parte anche dal timer e
      // da `visibilitychange`, cioè dopo che lo stato è cambiato.
      payload: () => ({ status: statoCanaleRef.current, at: Date.now() }),
      onSync: (stato) => {
        if (cancelled) return;
        // Il canale ha l'ultima parola su chi c'è ADESSO; sotto resta la riga
        // del team, che porta nome, colore e avatar. Chi non è nel canale
        // conserva il proprio `status`/`last_seen_at` dal database, che
        // `computePresence` fa invecchiare fino a 'offline' da solo.
        const vivi = daStatoCanale(stato);
        setPresenceMap(prev => {
          const next = { ...prev };
          for (const [id, p] of Object.entries(vivi)) {
            next[id] = { ...(next[id] || {}), ...p };
          }
          return next;
        });
      },
    });
    canaleRef.current = canale;

    // Rinfresco periodico della PROPRIA voce sul canale. ⚠️ Non è il vecchio
    // heartbeat: `track()` aggiorna lo stato del canale, non una riga in
    // realtime — nessun evento `postgres_changes`, nessuna consegna a tutti i
    // sottoscrittori di `users`. Serve solo a tenere fresco il `last_seen_at`
    // sintetico che `computePresence` legge, altrimenti dopo 60 secondi il
    // proprio pallino sbiadirebbe pur essendo connessi.
    refreshTimer = setInterval(() => canale.track(), REFRESH_PRESENZA_MS);

    const onVisibility = () => {
      // A-3 · Solo canale, nessuna scrittura: era il percorso che su mobile
      // scattava più spesso di tutti (commutatore di app, tendina notifiche,
      // selettore di file).
      statoCanaleRef.current = document.visibilityState === 'hidden'
        ? 'away'
        : (myBusyRef.current ? 'busy' : 'online');
      canale.track();
    };
    // `beforeunload` resta una scrittura: è l'ultimo momento in cui possiamo
    // lasciare sulla riga uno stato coerente per chi guarderà il pannello
    // Admin domani. Il canale si ritira da sé alla disconnessione — ed è la
    // ragione per cui questa scrittura, se non parte (il browser ucciso, la
    // scheda chiusa da mobile), non lascia più nessuno con un pallino verde
    // eterno: la presenza live non passa più da qui.
    const onBeforeUnload = () => { UsersAPI.setPresence(myId, 'offline'); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      canale.unsubscribe();
      canaleRef.current = null;
      // Best-effort: segnala offline (logout, cambio utente).
      UsersAPI.setPresence(myId, 'offline').then(() => {});
    };
  }, [enabled, userId, team]);

  return { presenceMap, myBusy, toggleMyBusy };
}
