// src/hooks/usePresence.js
// Presenza degli utenti: heartbeat periodico dell'utente corrente + mappa
// { userId → riga users } aggiornata via realtime.
//
// Tre sorgenti di verità sullo stato "online", tenute allineate qui:
//   - heartbeat ogni 30s (allineato al tick di ageing lato UI);
//   - visibilitychange → 'away' quando la scheda passa in background;
//   - beforeunload → 'offline' best-effort alla chiusura.
//
// Il toggle "Occupato" è manuale e vive in ChatPanel: lo teniamo in un ref
// così il beat lo legge senza far ripartire l'intero effetto (che
// ricreerebbe timer e subscription a ogni click).

import { useState, useRef, useCallback, useEffect } from "react";
import { Users as UsersAPI, subscribeToTable } from "../lib/api.js";

export function usePresence({ enabled, userId, team }) {
  // Mappa { userId -> rowDB } (per leggere last_seen_at e status).
  const [presenceMap, setPresenceMap] = useState({});
  // Stato "Occupato" manuale: il toggle vive in ChatPanel; lo teniamo in un ref
  // così il beat() lo legge senza far ripartire l'effetto presence.
  const [myBusy, setMyBusy] = useState(false);
  const myBusyRef = useRef(false);
  // M-1 dell'audit del 16 agosto. Il nuovo valore si calcola dal REF e le due
  // conseguenze (la scrittura su Supabase e l'aggiornamento della mappa di
  // presenza) stanno FUORI dall'updater di `setMyBusy`.
  //
  // Prima erano dentro, ed è la stessa forma che `chatCommands.js` documenta
  // come vietata (⛔ «mai chiamate di rete dentro l'updater di setState»): un
  // updater deve essere PURO perché React 18 può invocarlo più di una volta —
  // StrictMode lo fa di proposito, il Concurrent rendering può scartare un
  // render già calcolato e rigiocare la coda su una base più recente. Con la
  // rete lì dentro, un click su "Occupato" partiva due volte in sviluppo, e in
  // produzione l'aggiornamento della presenza dipendeva da quante volte React
  // avesse scelto di girare. Il ref è già il mirror di `myBusy` per il beat,
  // quindi leggerlo qui non aggiunge una seconda fonte di verità: la toglie
  // dall'updater, dove non poteva stare.
  const toggleMyBusy = useCallback(() => {
    const nv = !myBusyRef.current;
    myBusyRef.current = nv;
    setMyBusy(nv);
    if (!enabled || !userId) return;
    const st = nv ? 'busy' : 'online';
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
    let hbTimer = null;

    // Snapshot iniziale di tutti gli utenti
    const reload = () => {
      // Non passare per UsersAPI.list (filtra active=true): vogliamo tutti
      // gli utenti del team. initialTeam è già lo snapshot completo; uso quello
      // più aggiornamenti via realtime.
      const map = {};
      for (const u of team || []) map[u.id] = u;
      setPresenceMap(prev => ({ ...map, ...prev }));
    };
    reload();

    // Se status non è passato esplicitamente, rispetta il toggle "Occupato".
    const beat = (status) => {
      if (!myId) return;
      const eff = status || (myBusyRef.current ? 'busy' : 'online');
      UsersAPI.setPresence(myId, eff).then(r => {
        // `cancelled` è il guard del contratto «la risposta è arrivata tardi,
        // lasciala cadere» (docs/CLAUDE.md, gemello di useIsMounted): fra la
        // scrittura e la sua risposta l'effetto può essere stato smontato —
        // logout, cambio utente. In React 18 la setState sarebbe un no-op
        // silenzioso, quindi non era un difetto: era codice che dichiarava di
        // voler fare una cosa che non può fare. Fino a B-6 la variabile
        // esisteva ma la leggeva solo il tick di ageing, che ora vive altrove.
        if (cancelled) return;
        if (r?.error) console.warn("[presence] setPresence", r.error);
        // Aggiorno anche localmente per immediatezza
        setPresenceMap(prev => ({
          ...prev,
          [myId]: { ...(prev[myId] || {}), status: eff, last_seen_at: new Date().toISOString() },
        }));
      });
    };
    beat();
    // Caveat #3: heartbeat ogni 30s (era 45s) → lo stato online/away resta
    // reattivo. È la scrittura del PROPRIO stato, non un render periodico: il
    // tick che fa invecchiare i pallini altrui vive nei componenti che li
    // mostrano (B-6), e questo intervallo resta allineato alla sua soglia più
    // stretta — `computePresence` considera «online» un last_seen di meno di
    // un minuto, quindi battere ogni 30 s è ciò che tiene il proprio pallino
    // verde senza sfarfallii.
    hbTimer = setInterval(() => beat(), 30 * 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') beat('away');
      else beat();
    };
    const onBeforeUnload = () => beat('offline');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    // Realtime: aggiorna presenceMap quando un altro utente cambia status
    const unsub = subscribeToTable("users", (payload) => {
      const row = payload?.new || payload?.record;
      if (!row || !row.id) return;
      setPresenceMap(prev => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), ...row } }));
    });

    // ⛔ Qui NON c'è (più) un tick di re-render per l'ageing dei pallini.
    //
    // B-6 dell'audit di architettura del 16 agosto: c'era, ed era
    // `setInterval(() => setPresenceMap(prev => ({ ...prev })), 30_000)` — cioè
    // uno stato del GUSCIO sostituito ogni 30 secondi per far invecchiare dei
    // pallini che si vedono solo dentro il pannello chat, e solo quando è
    // aperto. Era l'unico render periodico dell'app: con le viste `memo` e le
    // prop stabili il costo era confinato, ma restava un render dell'intero
    // albero due volte al minuto per una cosa che nessuno stava guardando nel
    // 90% delle sessioni.
    //
    // L'ageing è ora dove la presenza si MOSTRA — `ConversationList` e
    // `ConversationView` chiamano `useTickLento` — quindi il timer esiste solo
    // mentre quei componenti sono montati e sveglia solo loro. `presenceMap`
    // cambia identità quando cambia DAVVERO: heartbeat proprio, evento
    // realtime di un collega, toggle "Occupato".

    return () => {
      cancelled = true;
      clearInterval(hbTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsub?.();
      // Best-effort: segnala offline
      if (myId) UsersAPI.setPresence(myId, 'offline').then(() => {});
    };
  }, [enabled, userId, team]);

  return { presenceMap, myBusy, toggleMyBusy };
}
