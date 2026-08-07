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
//
// SECONDO ARGOMENTO: `tabelle`. Un Set con i nomi delle tabelle che hanno
// generato gli eventi coalescati da questo debounce, oppure `null` per
// l'idratazione iniziale (dove non c'è nessun evento e va caricato tutto).
// Chi si sottoscrive a più tabelle può così ricaricare SOLO la parte che
// quegli eventi possono davvero aver invalidato, invece di ricaricare tutto
// per costruzione. Ignorarlo mantiene il comportamento precedente, quindi i
// consumatori che non lo leggono non cambiano di una virgola.
//
// Il nome della tabella arriva dalla closure creata al momento della
// sottoscrizione, non da `payload.table`: è vero che supabase-js lo espone,
// ma qui lo conosciamo già per costruzione e non c'è motivo di dipendere
// dalla forma del payload per un'informazione che abbiamo in mano.
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

    const run = (tabelle) => {
      const my = ++gen;
      return reloadRef.current(() => !cancelled && my === gen, tabelle);
    };

    // Idratazione iniziale: `null`, non un Set vuoto. I due casi vanno
    // distinguibili — "nessun evento, carica tutto" non è "eventi da un
    // insieme vuoto di tabelle", che non esiste.
    run(null);

    let timer = null;
    // Tabelle accumulate dagli eventi che il debounce sta coalescendo. Si
    // svuota quando il timer scatta, così ogni reload vede esattamente le
    // tabelle della propria finestra e non quelle di quella precedente.
    let pending = new Set();

    // filterEvent (se passato) può ritornare false per scartare un evento
    // prima che alimenti il debounce: utile per la sub `users` (sessione 29),
    // dove gli UPDATE da heartbeat presence (status/last_seen_at) non
    // richiedono il reload del team.
    const debounced = (tbl, payload) => {
      const fn = filterRef.current;
      if (fn && !fn(payload)) return;
      pending.add(tbl);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const tabelle = pending;
        pending = new Set();
        run(tabelle);
      }, delay);
    };

    const list = Array.isArray(tables) ? tables : [tables];
    const unsubs = list.map((tbl) => subscribeToTable(tbl, (p) => debounced(tbl, p)));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubs.forEach((u) => u?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, delay, ...deps]);
}
