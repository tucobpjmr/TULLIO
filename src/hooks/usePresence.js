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
  const toggleMyBusy = useCallback(() => {
    setMyBusy(prev => {
      const nv = !prev;
      myBusyRef.current = nv;
      const myId = userId;
      if (enabled && myId) {
        const st = nv ? 'busy' : 'online';
        UsersAPI.setPresence(myId, st).then(() => {});
        setPresenceMap(p => ({
          ...p,
          [myId]: { ...(p[myId] || {}), status: st, last_seen_at: new Date().toISOString() },
        }));
      }
      return nv;
    });
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
        if (r?.error) console.warn("[presence] setPresence", r.error);
        // Aggiorno anche localmente per immediatezza
        setPresenceMap(prev => ({
          ...prev,
          [myId]: { ...(prev[myId] || {}), status: eff, last_seen_at: new Date().toISOString() },
        }));
      });
    };
    beat();
    // Caveat #3: heartbeat ogni 30s (era 45s), allineato al tick di ageing
    // della presenza → lo stato online/away resta più reattivo.
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

    // Tick di re-render: ogni 30s ricomputo presenza per ageing
    const tick = setInterval(() => {
      if (cancelled) return;
      setPresenceMap(prev => ({ ...prev })); // shallow rerender
    }, 30 * 1000);

    return () => {
      cancelled = true;
      clearInterval(hbTimer);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsub?.();
      // Best-effort: segnala offline
      if (myId) UsersAPI.setPresence(myId, 'offline').then(() => {});
    };
  }, [enabled, userId, team]);

  return { presenceMap, myBusy, toggleMyBusy };
}
