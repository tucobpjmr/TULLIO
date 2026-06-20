// ─── useDebouncedTableSubscription (caveat #10) ─────────────────────────────
// Hook che astrae il pattern realtime ripetuto in VoyageDesk.jsx: idrata da
// Supabase al mount, poi si sottoscrive a una o più tabelle e ri-carica
// (debounced) ad ogni evento postgres. Gli eventi arrivano a raffica durante
// gli inserimenti bulk → il debounce coalesce le reload.
//
// `reload` riceve un predicato `isCurrent()`: ritorna false se l'effetto è
// stato smontato (cancelled) o se una reload più recente è già partita mentre
// questa era in volo (generation counter). Va chiamato DOPO ogni await, prima
// di scrivere nello stato, per scartare le risposte stale (caveat #21).
import { useEffect, useRef } from "react";
import { subscribeToTable } from "../lib/api.js";

export function useDebouncedTableSubscription(
  tables,
  reload,
  { enabled = true, delay = 200, deps = [], filterEvent } = {}
) {
  // reload e filterEvent possono catturare closure che cambiano ad ogni render:
  // li teniamo in ref così l'effetto non si ri-sottoscrive ad ogni render, ma
  // la reload vede sempre i valori freschi. Le dipendenze "vere" sono in `deps`.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const filterRef = useRef(filterEvent);
  filterRef.current = filterEvent;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let gen = 0;

    const run = () => {
      const my = ++gen;
      return reloadRef.current(() => !cancelled && my === gen);
    };

    // Idratazione iniziale.
    run();

    let timer = null;
    // filterEvent (se passato) può ritornare false per scartare un evento
    // prima che alimenti il debounce: utile per la sub `users` (sessione 29),
    // dove gli UPDATE da heartbeat presence (status/last_seen_at) non
    // richiedono il reload del team.
    const debounced = (payload) => {
      const fn = filterRef.current;
      if (fn && !fn(payload)) return;
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    };

    const list = Array.isArray(tables) ? tables : [tables];
    const unsubs = list.map((tbl) => subscribeToTable(tbl, debounced));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubs.forEach((u) => u?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, delay, ...deps]);
}
