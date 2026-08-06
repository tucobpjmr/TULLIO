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
  const reload = useCallback(async (isCurrent = () => true) => {
    setLoadError(null);
    const [rListe, rCestino, rSaldi] = await Promise.all([
      ListeAPI.list(), ListeAPI.listTrash(), ListeAPI.saldi(),
    ]);
    if (!isCurrent()) return;
    const fallita = [rListe, rCestino, rSaldi].find((r) => r.error);
    if (fallita) {
      console.error("[liste] caricamento", fallita.error);
      setLoadError(fallita.error.message);
      setLoading(false);
      return;
    }
    setDati({
      liste: rListe.data || [],
      cestino: rCestino.data || [],
      saldi: Object.fromEntries((rSaldi.data || []).map((s) => [s.lista_id, s])),
    });
    setLoading(false);
  }, []);

  useDebouncedTableSubscription(["liste_viaggio", "movimenti_lista"], reload, {
    enabled,
    deps: [enabled],
  });

  return { ...dati, loading, loadError, reload };
}
