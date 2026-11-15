// src/components/liste/useHomeListe.js
// Ricerca, filtro, ordinamento e finestra dell'elenco delle liste.
//
// M-3 dell'analisi del 14 novembre: era dentro ListeViaggio. Sta in un hook e
// non dentro ListeHome perché lo chiama ListeViaggio, che resta montato anche
// mentre un dettaglio è aperto: tornando all'elenco, ricerca e filtro sono
// quelli lasciati. Dentro ListeHome si azzererebbero a ogni apertura.
import { useId, useMemo, useState } from "react";
import { terminiRicerca } from "../../lib/searchUtils.js";
import { useFinestra } from "../../hooks/useFinestra.js";
import { FILTRI_ALTROVE, filtraIndicizzate, indicizzaLista, ordinaListe } from "./listeOrdinamento.js";

const HOME_PAGE_SIZE = 10;

/**
 * @param {{ liste: any[], cestino: any[], saldi: Record<string, any> }} dati
 */
export function useHomeListe({ liste, cestino, saldi }) {
  // Quattro valori INDIPENDENTI dell'elenco: si cerca dentro un filtro, con un
  // ordinamento, mostrando N righe. Restano useState separati di proposito —
  // non sono una macchina a stati e accorparli è la parte del rilievo ST-7 che
  // non va fatta (vedi il commento in listeReducers.js).
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("attive");
  const [sort, setSort] = useState("recenti");
  // M-4 dell'audit del 2 settembre: `htmlFor` esplicito invece della forma
  // annidata, che si rompe in silenzio alla prima ristrutturazione del markup.
  const idOrdina = useId();

  // La ricerca si applica a TUTTI e quattro gli insiemi, non solo a quello
  // selezionato: il filtro decide cosa si mostra, ma i conteggi degli altri
  // servono per dire dove sono finiti i risultati che non si vedono.
  // M-3 · L'indice di ricerca delle liste, ricostruito quando cambiano le
  // liste e non a ogni battuta: la normalizzazione (accenti, apostrofi,
  // variante senza spazi) e la raccolta dei cointestatari dipendono dalla
  // RIGA, non da ciò che si digita.
  const indiceListe = useMemo(() => liste.map((l) => ({ l, idx: indicizzaLista(l) })), [liste]);
  const indiceCestino = useMemo(() => cestino.map((l) => ({ l, idx: indicizzaLista(l) })), [cestino]);

  const risultati = useMemo(() => {
    const termini = terminiRicerca(search);
    // Un solo passaggio sull'indice, poi la partizione per stato: prima erano
    // quattro filtri testuali completi sugli stessi dati (attive, esaurite,
    // tutte, cestino), cioè le liste attive normalizzate due volte per battuta.
    const tutte = filtraIndicizzate(indiceListe, termini);
    return {
      attive: tutte.filter((l) => l.stato === "attiva"),
      esaurite: tutte.filter((l) => l.stato === "esaurita"),
      tutte,
      cestino: filtraIndicizzate(indiceCestino, termini),
    };
  }, [indiceListe, indiceCestino, search]);

  const visibili = useMemo(
    () => ordinaListe(risultati[filter] || [], saldi, sort),
    [risultati, filter, saldi, sort],
  );

  // M-2 · La finestra dell'elenco dall'hook condiviso (hooks/useFinestra.js).
  const finestra = useFinestra(visibili, HOME_PAGE_SIZE, [search, filter, sort]);

  // Conteggi per il menu a tendina del filtro. Senza, l'elenco mostra il
  // totale delle sole "Attive" (il filtro di default) mentre il backup conta
  // tutte le liste: due numeri diversi e nessun modo di capire perché.
  const conteggi = useMemo(() => ({
    attive: liste.filter((l) => l.stato === "attiva").length,
    esaurite: liste.filter((l) => l.stato === "esaurita").length,
    tutte: liste.length,
    cestino: cestino.length,
  }), [liste, cestino]);

  // Risultati che la ricerca ha trovato ma che il filtro corrente nasconde.
  // È il caso in cui l'elenco mente per omissione: la lista di un cliente
  // esiste, l'anagrafica la conta nel suo badge, ma è ESAURITA e il filtro di
  // default mostra solo le attive — quindi qui non compare e sembra un
  // problema della ricerca.
  const altrove = useMemo(() => {
    if (!terminiRicerca(search).length) return [];
    return (FILTRI_ALTROVE[filter] || [])
      .map((k) => ({ key: k, n: (risultati[k] || []).length }))
      .filter((x) => x.n > 0);
  }, [search, filter, risultati]);

  return {
    search, setSearch, filter, setFilter, sort, setSort, idOrdina,
    visibili, finestra, conteggi, altrove,
  };
}
