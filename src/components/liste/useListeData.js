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

import { useState, useCallback } from "react";
import { ListeAPI } from "../../lib/listeApi.js";
import { useDebouncedTableSubscription } from "../../hooks/useDebouncedTableSubscription.js";

const VUOTO = { liste: [], cestino: [], saldi: {} };

// Indicizza le righe della vista `liste_saldi` per lista_id: è la forma in cui
// l'elenco le consuma. Fuori dal componente perché è pura e non deve entrare
// nelle deps di useCallback.
const perListaId = (righe) =>
  Object.fromEntries((righe || []).map((s) => [s.lista_id, s]));

/**
 * @param {object}  opts
 * @param {boolean} opts.enabled  false per i ruoli senza accesso al modulo
 *                                (il Driver): niente fetch, niente subscription.
 */
export function useListeData({ enabled = true } = {}) {
  const [dati, setDati] = useState(VUOTO);
  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState(null);

  // `isCurrent` arriva da useDebouncedTableSubscription: va interrogato DOPO
  // ogni await, altrimenti una risposta lenta di un reload vecchio può
  // sovrascrivere quella di uno più recente (il classico last-write-wins fra
  // due fetch concorrenti).
  const reload = useCallback(async (isCurrent = () => true, tabelle = null) => {
    // Chiuso sui soli setter di React (identità stabile per contratto), così
    // `reload` può restare con deps vuote: la sua identità è passata a
    // useDebouncedTableSubscription, dove cambiarla a ogni render
    // provocherebbe una ri-sottoscrizione continua.
    const fallisci = (errore) => {
      console.error("[liste] caricamento", errore);
      setLoadError(errore.message);
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
    // rinominata, archiviata o ripristinata cambia elenco e cestino.
    const soloSaldi = tabelle !== null && tabelle.size > 0 && !tabelle.has("liste_viaggio");

    if (soloSaldi) {
      const rSaldi = await ListeAPI.saldi();
      if (!isCurrent()) return;
      if (rSaldi.error) return fallisci(rSaldi.error);
      // Aggiornamento funzionale: liste e cestino restano quelli già in stato,
      // e non vanno letti dalle deps di useCallback (che deve restare vuoto
      // perché `reload` è passato a useDebouncedTableSubscription, dove
      // un'identità instabile provocherebbe una ri-sottoscrizione a ogni render).
      setDati((d) => ({ ...d, saldi: perListaId(rSaldi.data) }));
      setLoading(false);
      return;
    }

    const [rListe, rCestino, rSaldi] = await Promise.all([
      ListeAPI.list(), ListeAPI.listTrash(), ListeAPI.saldi(),
    ]);
    if (!isCurrent()) return;
    const fallita = [rListe, rCestino, rSaldi].find((r) => r.error);
    if (fallita) return fallisci(fallita.error);
    setDati({
      liste: rListe.data || [],
      cestino: rCestino.data || [],
      saldi: perListaId(rSaldi.data),
    });
    setLoading(false);
  }, []);

  useDebouncedTableSubscription(["liste_viaggio", "movimenti_lista"], reload, {
    enabled,
    deps: [enabled],
  });

  return { ...dati, loading, loadError, reload };
}
