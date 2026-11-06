// Quali campi del pannello task mostrano ora «Salvato ✓» — B-6 dell'analisi
// del 4 novembre. `segna(campo)` accende l'indicatore per DURATA_MS; un secondo
// salvataggio dello stesso campo riparte da capo invece di spegnerlo a metà.
// I timer si cancellano allo smontaggio, e un salvataggio che risponde DOPO
// (il pannello si chiude spesso subito dopo l'ultimo blur) non ne arma uno
// nuovo: un setState su un componente smontato è il codice che dichiara di
// voler fare una cosa che non può fare.
import { useCallback, useEffect, useRef, useState } from "react";

export const DURATA_SALVATO_MS = 2000;

export function useCampiSalvati() {
  const [accesi, impostaAccesi] = useState(() => new Set());
  const timer = useRef(new Map());
  const smontato = useRef(false);

  useEffect(() => {
    smontato.current = false;
    const attivi = timer.current;
    return () => {
      smontato.current = true;
      for (const t of attivi.values()) clearTimeout(t);
      attivi.clear();
    };
  }, []);

  const segna = useCallback((campo) => {
    if (smontato.current) return;
    clearTimeout(timer.current.get(campo));
    impostaAccesi((prima) => (prima.has(campo) ? prima : new Set(prima).add(campo)));
    timer.current.set(campo, setTimeout(() => {
      timer.current.delete(campo);
      impostaAccesi((prima) => {
        if (!prima.has(campo)) return prima;
        const dopo = new Set(prima);
        dopo.delete(campo);
        return dopo;
      });
    }, DURATA_SALVATO_MS));
  }, []);

  const salvato = useCallback((campo) => accesi.has(campo), [accesi]);

  return { salvato, segna };
}
