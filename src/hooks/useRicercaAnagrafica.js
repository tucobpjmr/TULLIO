// src/hooks/useRicercaAnagrafica.js
// A-1 (audit del 30 agosto) — la ricerca dell'anagrafica clienti (ClientiView)
// interroga il server mentre si digita, al posto del filtro in memoria su
// tutto il corpus scaricato da useClientiCompleti(): quel filtro è O(N) nel
// browser, la soglia realistica è 5.000-10.000 righe (vedi il preambolo di
// supabase/migrations/20260830190000_clienti_ricerca_trgm.sql).
//
// Stesso contratto di useRicercaClienti.js (debounce, guardia di staleness,
// degradazione a elenco vuoto senza rete), con due differenze che la ricerca
// dell'ANAGRAFICA richiede e quella dell'autocomplete no:
//   • CONTEGGIO — la UI dichiara «N di totale», non un elenco troncato senza
//     numero (vedi Clients.cercaAnagrafica in lib/api/clienti.js);
//   • ERRORE ESPOSTO — un filtro in memoria non può fallire; una query di
//     rete sì, e "0 risultati" per un errore di rete sembrerebbe "nessun
//     cliente trovato", che è un'affermazione diversa e falsa su
//     un'anagrafica — la stessa distinzione che governa gli scheletri di
//     caricamento (docs/CLAUDE.md, «Stati di attesa onesti»).
//
// I risultati arrivano mappati con fromDbClient: la RPC ritorna righe DB
// (snake_case) e ClientiView legge `createdAt` per l'ordinamento «Più
// recenti», non `created_at» — stessa convenzione di useAppHydration.js, che
// mappa `Clients.list()` allo stesso modo.
import { useEffect, useState } from "react";
import { Clients } from "../lib/api.js";
import { fromDbClient } from "../lib/mappers.js";
import { ATTESA_RICERCA_MS } from "./useRicercaClienti.js";

const VUOTO = { risultati: [], count: 0, caricando: false, errore: null };

/**
 * @param {string}  query    il testo digitato
 * @param {object}  [opts]
 * @param {boolean} [opts.enabled]  false → nessuna richiesta, stato vuoto
 * @param {number}  [opts.limite]   quante righe chiedere al server
 */
export function useRicercaAnagrafica(query, { enabled = true, limite = 200 } = {}) {
  const [stato, setStato] = useState(VUOTO);

  useEffect(() => {
    const q = String(query ?? "").trim();
    if (!enabled || !q) {
      setStato(VUOTO);
      return undefined;
    }
    let annullato = false;
    // Il risultato precedente resta a schermo finché non arriva quello nuovo
    // (stesso compromesso dell'autocomplete): solo `caricando` cambia, non
    // `risultati`, così la lista non lampeggia vuota a ogni battuta.
    setStato((s) => ({ ...s, caricando: true, errore: null }));
    const timer = setTimeout(() => {
      Promise.resolve(Clients.cercaAnagrafica(q, { limite }))
        .then((r) => {
          if (annullato) return;
          if (r?.error) {
            setStato({ risultati: [], count: 0, caricando: false, errore: r.error });
            return;
          }
          setStato({
            risultati: (r?.data || []).map(fromDbClient),
            count: r?.count ?? 0,
            caricando: false,
            errore: null,
          });
        })
        .catch((e) => {
          if (!annullato) setStato({ risultati: [], count: 0, caricando: false, errore: e });
        });
    }, ATTESA_RICERCA_MS);
    return () => { annullato = true; clearTimeout(timer); };
  }, [enabled, query, limite]);

  return stato;
}
