// src/hooks/useRicercaClienti.js
// M-1 (passo 2) dell'audit performance/UX del 19 agosto — la ricerca cliente
// che interroga il server mentre si digita.
//
// PERCHÉ È UN HOOK IN `src/hooks/` E NON UNA FUNZIONE DENTRO IL COMPONENTE.
// Non è una preferenza di collocazione: `eslint.config.js` vieta a
// `src/components/**` di importare il data layer, e il messaggio della regola
// dice dove va il codice che legge — «Le letture stanno in src/hooks/». La
// tendina di suggerimento è un componente, quindi la query vive qui e lì
// arriva già come dati.
//
// COSA FA, in tre righe che sono tutte necessarie:
//   • DEBOUNCE — una richiesta per parola digitata, non una per carattere;
//   • GUARDIA DI STALENESS — fra due battute possono esserci due richieste in
//     volo, e quella più vecchia non deve sovrascrivere la più recente (è il
//     contratto `isCurrent()`/`useIsMounted()` di docs/CLAUDE.md, qui nella
//     forma più semplice: una variabile catturata dalla chiusura dell'effetto);
//   • DEGRADAZIONE — senza rete, o senza Supabase (dev senza login), si
//     ritorna un elenco vuoto invece di sollevare: un suggerimento mancante
//     non è un errore da mostrare, e il chiamante ha comunque i propri
//     risultati locali.

import { useEffect, useState } from "react";
import { Clients as ClientsAPI } from "../lib/api.js";

// Quanto si aspetta dopo l'ultimo tasto prima di interrogare il server.
// 200 ms è sotto la soglia in cui una tendina sembra lenta e sopra la cadenza
// di battuta di chi digita normalmente.
export const ATTESA_RICERCA_MS = 200;

/**
 * @param {string}  query    il testo digitato (già normalizzato dal chiamante)
 * @param {object}  [opts]
 * @param {boolean} [opts.enabled]  false → nessuna richiesta, elenco vuoto
 * @param {number}  [opts.limit]    quante righe chiedere al server
 * @returns {Array} i clienti che corrispondono, o `[]`
 */
export function useRicercaClienti(query, { enabled = true, limit = 12 } = {}) {
  const [risultati, setRisultati] = useState([]);

  useEffect(() => {
    if (!enabled || !query) {
      setRisultati([]);
      return undefined;
    }
    let annullato = false;
    const timer = setTimeout(() => {
      Promise.resolve(ClientsAPI.cerca(query, { limit }))
        .then((r) => {
          if (annullato || r?.error) return;
          setRisultati(r?.data || []);
        })
        .catch(() => { /* vedi «degradazione» in testa al file */ });
    }, ATTESA_RICERCA_MS);
    return () => { annullato = true; clearTimeout(timer); };
  }, [enabled, query, limit]);

  return risultati;
}
