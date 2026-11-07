// ─── useDebouncedTableSubscription ─────────────────────────────────────────
// Idrata da Supabase al mount, si sottoscrive a una o più tabelle e ricarica
// (debounced) a ogni evento: gli eventi arrivano a raffica, il debounce li
// coalesce.
//
// `reload(isCurrent, tabelle)`:
//   - `isCurrent()` è false se l'effetto è smontato o se un reload più recente
//     è già partito: va chiamato DOPO ogni await, prima di scrivere lo stato.
//   - `tabelle` è il Set delle tabelle che hanno generato gli eventi, o `null`
//     per l'idratazione iniziale e la ripresa (carica tutto).
//
// Ripresa dopo un buco di connessione: Postgres Changes non riprende da un
// offset, gli eventi persi col socket giù non arrivano MAI. Su `online` e sul
// ritorno in primo piano si ricarica tutto (`tabelle = null`).
// M-3 · Il ritorno in primo piano ha una SOGLIA (SOGLIA_RIPRESA_MS): su mobile
// `visibilitychange` scatta per ogni gesto (allegare un file, la tendina delle
// notifiche), e le istanze di questo hook sono nove. Sotto la soglia il socket
// non è caduto. `online` non ha soglia: lì la caduta è un fatto.
import { useCallback, useEffect, useRef } from "react";
import { subscribeToTable } from "../lib/api.js";
import { segnalaStatoCanale, dimenticaCanale } from "../lib/freschezzaRealtime.js";

// Id di SOTTOSCRIZIONE per il registro della freschezza: `users` è osservata
// due volte nella stessa sessione, il nome della tabella non basta.
let seqSottoscrizione = 0;

// Sopra i 30 s i browser mobili congelano timer e socket delle tab nascoste;
// sotto, il canale resta agganciato.
export const SOGLIA_RIPRESA_MS = 30_000;

// ─── opzioni ───────────────────────────────────────────────────────────────
// applyRow(tabella, payload) → true: l'evento è già applicato allo state
//   (tipicamente una MERGE_*_ROW) e NON entra nel debounce. false o assente:
//   alimenta il debounce e il reload. Solo per tabelle piatte, la cui riga
//   basta a sé.
// saltaPrimoCaricamento (B-1): salta solo il fetch iniziale (il team l'ha già
//   letto AuthContext). ⚠️ Chi lo passa deve seminare lo stato e chiudere il
//   proprio flag di caricamento da sé.
// senzaCanale (B-1): idratazione e ripresa senza canale permanente.
// filterEvent(payload) → false scarta l'evento prima del debounce.
/**
 * @param {string|string[]} tables
 * @param {(isCurrent: () => boolean, tabelle: Set<string>|null) => (void|Promise<void>)} reload
 * @param {object} [opts]
 * @param {boolean} [opts.enabled]
 * @param {number} [opts.delay]
 * @param {any[]} [opts.deps]
 * @param {(payload: object) => boolean} [opts.filterEvent]
 * @param {(tabella: string, payload: object) => boolean} [opts.applyRow]
 * @param {boolean} [opts.saltaPrimoCaricamento]
 * @param {boolean} [opts.senzaCanale]
 */
export function useDebouncedTableSubscription(
  tables,
  reload,
  {
    enabled = true, delay = 200, deps = [], filterEvent, applyRow,
    saltaPrimoCaricamento = false, senzaCanale = false,
  } = {}
) {
  // In ref: l'effetto non si risottoscrive a ogni render ma vede i valori
  // freschi. Le dipendenze vere sono in `deps`.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const filterRef = useRef(filterEvent);
  filterRef.current = filterEvent;
  const applyRowRef = useRef(applyRow);
  applyRowRef.current = applyRow;

  // A-3 · Il «Riprova» passa da `run`, cioè dallo stesso gen-counter degli altri
  // reload: una chiamata da fuori potrebbe sovrascrivere un reload più recente.
  // Azzerato nel cleanup: niente richieste per una vista smontata.
  const ricaricaRef = useRef(null);
  const ricarica = useCallback(() => { ricaricaRef.current?.(); }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let gen = 0;

    const run = (tabelle) => {
      const my = ++gen;
      return reloadRef.current(() => !cancelled && my === gen, tabelle);
    };

    // `null`: dopo un errore non si sa quale parte sia mancata.
    ricaricaRef.current = () => run(null);

    // Idratazione iniziale: `null`, non un Set vuoto.
    // `gen` avanza anche quando si salta (B-1): conta le richieste PARTITE.
    if (saltaPrimoCaricamento) gen += 1;
    else run(null);

    let timer = null;
    // Tabelle accumulate nella finestra del debounce; si svuota allo scatto.
    let pending = new Set();

    // filterEvent scarta un evento prima del debounce (es. gli UPDATE di sola
    // presenza su `users`).
    const debounced = (tbl, payload) => {
      const fn = filterRef.current;
      if (fn && !fn(payload)) return;
      // applyRow PRIMA del debounce: un evento gestito non entra in `pending`.
      // ⚠️ A-1 · `gen` avanza anche qui: un reload già in volo riflette lo stato di
      // prima della riga, e senza questo la sovrascriverebbe.
      if (applyRowRef.current?.(tbl, payload)) {
        gen += 1;
        return;
      }
      pending.add(tbl);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const tabelle = pending;
        pending = new Set();
        run(tabelle);
      }, delay);
    };

    // B-1 · `senzaCanale`: niente canale per `categories` e `message_templates`
    // (poche righe, cambiano di rado). Idratazione e ripresa restano. Il prezzo:
    // una categoria nuova compare sugli altri client al ritorno in primo piano.
    const list = senzaCanale
      ? []
      : (Array.isArray(tables) ? tables : [tables]);

    // `online` e `visibilitychange` arrivano spesso insieme: un debounce dedicato
    // ne fa un reload solo.
    let reconnectTimer = null;
    const onReconnectSignal = () => {
      // Il reload parziale in coda si assorbe SUBITO: quello completo lo copre.
      clearTimeout(timer);
      pending = new Set();
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => run(null), 300);
    };
    const onOnline = () => onReconnectSignal();

    // A-1 · Lo stato del canale, segnalato E recuperato: le due metà vanno
    // insieme. ⚠️ Il riaggancio riuscito vale come `online`: gli eventi passati col
    // canale giù sono persi, si ricarica tutto.
    const idSottoscrizione = ++seqSottoscrizione;
    const chiaviCanale = [];
    // Il primo 'SUBSCRIBED' è l'aggancio iniziale, non un ritorno.
    let eraDegradato = false;

    const unsubs = list.map((tbl) => {
      const chiave = `${tbl}#${idSottoscrizione}`;
      chiaviCanale.push(chiave);
      return subscribeToTable(tbl, (p) => debounced(tbl, p), (stato) => {
        if (cancelled) return;
        segnalaStatoCanale(chiave, stato);
        if (stato === "SUBSCRIBED") {
          if (eraDegradato) onReconnectSignal();
          eraDegradato = false;
          return;
        }
        eraDegradato = true;
      });
    });

    // `null` = mai in secondo piano da quando l'effetto è partito.
    let nascostoDa = document.visibilityState === "hidden" ? Date.now() : null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        nascostoDa = Date.now();
        return;
      }
      const pausa = nascostoDa === null ? 0 : Date.now() - nascostoDa;
      nascostoDa = null;
      if (pausa < SOGLIA_RIPRESA_MS) return;
      onReconnectSignal();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(reconnectTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubs.forEach((u) => u?.());
      // A-1 · Staccare i canali significa anche toglierli dal registro, o una
      // striscia resterebbe accesa per sempre.
      chiaviCanale.forEach(dimenticaCanale);
      ricaricaRef.current = null;
    };
    // B-2 · `JSON.stringify(deps)` fissa la lunghezza dell'array: React solleva
    // se cambia fra due render. I chiamanti passano valori serializzabili.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, delay, JSON.stringify(deps)]);

  // Identità STABILE: finisce nelle prop delle viste memoizzate.
  return ricarica;
}
