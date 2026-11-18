// src/components/liste/useListeData.js
// I dati della home del modulo Liste viaggio: elenco, cestino, saldi.
//
// PERCHÉ ESISTE. Il modulo Liste è nato come SPA a sé e aveva un'architettura
// dati tutta sua, incompatibile con quella del resto dell'app:
//
//   core   → reducer + registry di persistenza + subscription realtime
//            debounced, con update ottimistico e rollback dichiarativo;
//   liste  → useState locali + chiamate dirette a ListeAPI + `await loadHome()`
//            manuale dopo ogni scrittura, nessun realtime.
//
// Le conseguenze erano concrete, non stilistiche: due utenti sulla stessa lista
// non si vedevano a vicenda (nessun evento arrivava), e ogni singola scrittura
// costava tre round-trip di refetch completo (list + listTrash + saldi,
// ciascuna paginata a 1000 righe) perché senza realtime il client non aveva
// altro modo di sapere che qualcosa era cambiato.
//
// Questo hook riusa la stessa astrazione del core — useDebouncedTableSubscription
// (caveat #10) — quindi il modulo eredita gratis debounce, coalescing degli
// eventi in raffica e il gen-counter che scarta le risposte obsolete quando due
// reload si accavallano. Le tabelle sono state pubblicate su supabase_realtime
// dalla migrazione 20260806090000_liste_realtime.sql: prima non lo erano, e
// una subscription su di esse non avrebbe mai ricevuto un evento.

import { useState, useCallback, useRef } from "react";
import { ListeAPI } from "../../lib/api/liste.js";
import { useDebouncedTableSubscription } from "../../hooks/useDebouncedTableSubscription.js";
import { erroreUtente } from "../../lib/errori.js";

const VUOTO = { liste: [], cestino: [], saldi: {} };

// Indicizza le righe della vista `liste_saldi` per lista_id: è la forma in cui
// l'elenco le consuma. Fuori dal componente perché è pura e non deve entrare
// nelle deps di useCallback.
const perListaId = (righe) =>
  Object.fromEntries((righe || []).map((s) => [s.lista_id, s]));

// Oltre questo numero di liste toccate in una finestra di debounce (un import
// di backup, un reset) si rilegge la vista intera: un `in(...)` con centinaia
// di id allunga l'URL più di quanto faccia risparmiare.
export const TETTO_SALDI_MIRATI = 100;

// I saldi delle liste in `ids`, sostituiti in `saldi`. Un id senza riga di
// ritorno (lista cestinata nel frattempo) esce dalla mappa: la vista
// `liste_saldi` non lo contiene più, e la lettura completa farebbe lo stesso.
const fondiSaldi = (saldi, ids, righe) => {
  const out = { ...saldi };
  for (const id of ids) delete out[id];
  return { ...out, ...perListaId(righe) };
};

/**
 * @param {object}  [opts]
 * @param {boolean} [opts.enabled=true]  false per i ruoli senza accesso al
 *                                modulo (il Driver): niente fetch, niente
 *                                subscription.
 */
export function useListeData({ enabled = true } = {}) {
  const [dati, setDati] = useState(VUOTO);
  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState(null);

  // Generazione condivisa fra IL RELOAD MANUALE (chiamato da ListeViaggio dopo
  // ogni scrittura, `loadHome()` senza argomenti) e IL RELOAD REALTIME
  // (chiamato da useDebouncedTableSubscription con il proprio `isCurrent`).
  // Prima, un `reload()` senza argomenti riceveva `isCurrent = () => true` —
  // la guardia anti-stale del realtime era semplicemente ASSENTE per quella
  // chiamata, e un reload manuale lento poteva sovrascrivere una risposta
  // realtime più recente ma più veloce (vince il più vecchio). Incrementando
  // `genRef` a OGNI reload, da qualunque origine, l'ordine di ARRIVO delle
  // risposte smette di contare: conta solo l'ordine di PARTENZA, e l'ultimo
  // partito è sempre quello che vince, indipendentemente da chi lo ha
  // lanciato o da quanto ci mette a rispondere.
  const genRef = useRef(0);

  // Le liste i cui movimenti sono cambiati dall'ultimo reload, raccolte in
  // `applyRow`. `null` = c'è stato un evento senza `lista_id` leggibile (una
  // DELETE: `movimenti_lista` ha la replica identity di default, e `old` porta
  // solo la chiave primaria) → si rilegge tutta la vista. Un ref: è il
  // parametro della prossima query, non un dato da disegnare.
  const listeToccate = useRef(/** @type {Set<string>|null} */ (new Set()));

  // `isCurrent` arriva da useDebouncedTableSubscription per il ramo realtime
  // (default `() => true` per il ramo manuale, che non ha un effetto da cui
  // dedurne uno proprio): va interrogato DOPO ogni await, altrimenti una
  // risposta lenta di un reload vecchio può sovrascrivere quella di uno più
  // recente (il classico last-write-wins fra due fetch concorrenti). La
  // generazione qui sopra copre ANCHE il caso in cui isCurrent resti il
  // default: le due condizioni si compongono in AND, non si sostituiscono.
  // `tabelle` è l'insieme delle tabelle toccate dall'evento realtime, `null`
  // all'idratazione iniziale. Il tipo sta sul ripiego perché il ripiego da solo
  // lo dichiarerebbe `null` e basta (M-3 dell'audit del 10 settembre).
  const reload = useCallback(async (isCurrent = () => true, tabelle = /** @type {Set<string>|null} */ (null)) => {
    // Chiuso sui soli setter di React (identità stabile per contratto), così
    // `reload` può restare con deps vuote: la sua identità è passata a
    // useDebouncedTableSubscription, dove cambiarla a ogni render
    // provocherebbe una ri-sottoscrizione continua. `genRef` è un ref: la
    // stessa ragione vale per lui.
    const mia = ++genRef.current;
    // «La mia è ancora l'ultima partita» E «l'effetto/chiamante che mi ha
    // lanciata non è stato smontato/superato» (quest'ultima è `isCurrent`).
    const attuale = () => mia === genRef.current && isCurrent();

    const fallisci = (errore) => {
      console.error("[liste] caricamento", errore);
      setLoadError(erroreUtente(errore, "errore imprevisto"));
      setLoading(false);
    };

    setLoadError(null);

    // Un movimento cambia i SALDI e nient'altro: l'elenco delle liste e il
    // cestino non possono essere stati invalidati da una scrittura su
    // movimenti_lista. Finché reload non sapeva quale tabella avesse generato
    // l'evento era costretto a ricaricare tutto per costruzione, e siccome
    // registrare un movimento è l'operazione più frequente del modulo, ogni
    // singolo movimento faceva scaricare l'intero elenco (centinaia di liste)
    // e l'intero cestino a OGNI client connesso. Qui ricarichiamo la sola
    // parte che quell'evento può aver toccato.
    //
    // `tabelle === null` è l'idratazione iniziale (nessun evento): serve
    // tutto. Un Set che contiene liste_viaggio pure: una lista creata,
    // rinominata, archiviata o ripristinata cambia elenco e cestino — e così
    // `lista_beneficiari`, che l'elenco porta con sé (A-1 dell'audit del 16
    // agosto): `LISTA_SELECT` incorpora i cointestatari e `intestazioneLista`
    // ne costruisce la testata, quindi un cointestatario aggiunto o rimosso
    // invalida le righe esattamente come un rename. La condizione è scritta
    // in positivo — «solo movimenti» — così una tabella aggiunta domani alla
    // sottoscrizione ricade nel ramo completo (più lento, mai sbagliato)
    // invece di finire per default in quello parziale.
    const soloSaldi = tabelle !== null && tabelle.size > 0
      && [...tabelle].every((t) => t === "movimenti_lista");

    if (soloSaldi) {
      // Presi e azzerati PRIMA dell'await: un evento che arriva durante la
      // query appartiene al giro successivo.
      const toccate = listeToccate.current;
      listeToccate.current = new Set();
      // Insieme vuoto (un giro concorrente l'ha già consumato) o oltre il tetto:
      // si rilegge la vista intera, che è più lento ma mai sbagliato.
      const ids = toccate && toccate.size > 0 && toccate.size <= TETTO_SALDI_MIRATI
        ? [...toccate] : null;
      // ⚠️ Un giro scartato o fallito rimette le sue liste nell'insieme: senza,
      // quei saldi resterebbero vecchi fino al prossimo reload completo.
      const rimetti = () => {
        if (!ids || !listeToccate.current) { listeToccate.current = null; return; }
        for (const id of ids) listeToccate.current.add(id);
      };
      const rSaldi = ids ? await ListeAPI.saldiPerListe(ids) : await ListeAPI.saldi();
      if (!attuale()) { rimetti(); return; }
      if (rSaldi.error) { rimetti(); return fallisci(rSaldi.error); }
      // Aggiornamento funzionale: liste e cestino restano quelli già in stato,
      // e non vanno letti dalle deps di useCallback (che deve restare vuoto
      // perché `reload` è passato a useDebouncedTableSubscription, dove
      // un'identità instabile provocherebbe una ri-sottoscrizione a ogni render).
      setDati((d) => ({
        ...d,
        saldi: ids ? fondiSaldi(d.saldi, ids, rSaldi.data) : perListaId(rSaldi.data),
      }));
      setLoading(false);
      return;
    }

    // Il ramo completo rilegge tutti i saldi: le liste raccolte sono coperte.
    listeToccate.current = new Set();
    const [rListe, rCestino, rSaldi] = await Promise.all([
      ListeAPI.list(), ListeAPI.listTrash(), ListeAPI.saldi(),
    ]);
    if (!attuale()) return;
    const fallita = [rListe, rCestino, rSaldi].find((r) => r.error);
    if (fallita) return fallisci(fallita.error);
    setDati({
      liste: rListe.data || [],
      cestino: rCestino.data || [],
      saldi: perListaId(rSaldi.data),
    });
    setLoading(false);
  }, []);

  // `lista_beneficiari` è la terza tabella (A-1 dell'audit del 16 agosto): la
  // cointestazione vive lì, l'elenco la porta con sé dentro `LISTA_SELECT` e
  // fino alla migrazione 20260815235446 quella tabella non era nemmeno
  // pubblicata su `supabase_realtime` — nessun evento partiva, quindi nessun
  // altro client sapeva che l'intestazione di una lista era cambiata.
  useDebouncedTableSubscription(
    ["liste_viaggio", "movimenti_lista", "lista_beneficiari"],
    reload,
    {
      enabled, deps: [enabled],
      // Raccoglie QUALE lista ha cambiato movimenti, poi lascia partire il
      // reload (`false`). `lista_id` di un movimento non cambia mai (nessuna
      // RPC lo aggiorna), quindi `new.lista_id` basta per INSERT e UPDATE.
      applyRow: (tbl, payload) => {
        if (tbl !== "movimenti_lista" || !listeToccate.current) return false;
        const id = payload?.new?.lista_id ?? payload?.old?.lista_id;
        if (id) listeToccate.current.add(id);
        else listeToccate.current = null;
        return false;
      },
    },
  );

  return { ...dati, loading, loadError, reload };
}
