// src/hooks/useNuovaVersione.js
//
// ─── M-2 dell'analisi del 6 novembre · «C'È UNA VERSIONE NUOVA» ────────────
// Una scheda aperta da giorni — i driver e il banco tengono la PWA aperta per
// mestiere — continua a eseguire la build con cui è partita. Fino a oggi se ne
// accorgeva solo quando un chunk lazy rispondeva 404 dopo un deploy
// (`PannelloAppAggiornata`), cioè nel momento peggiore: aprendo un pannello.
//
// Qui si chiede al server quale build è in linea: `/version.json`, scritto dal
// plugin `versioneBuild` di vite.config.js con lo stesso id compilato nel
// bundle come `import.meta.env.VITE_BUILD_ID`. Se i due differiscono, l'hook
// risponde `true` e il guscio lo dice con una striscia (OfflineBanner.jsx).
//
// QUANDO CHIEDE: ogni `intervalloMs`, al ritorno in primo piano e al ritorno
// della rete — non all'avvio, dove la build appena scaricata È quella in linea.
// Una scheda nascosta non chiede: lo farà tornando visibile. Trovata la
// versione nuova smette, perché la risposta non può tornare indietro.
//
// Senza un id compilato (sviluppo, test) non chiede niente.
import { useEffect, useState } from "react";

export const INTERVALLO_VERSIONE_MS = 5 * 60 * 1000;

/**
 * @param {object} [opzioni]
 * @param {string} [opzioni.buildCorrente] l'id della build in esecuzione;
 *   per default quello compilato nel bundle.
 * @param {number} [opzioni.intervalloMs]
 * @returns {boolean} `true` quando la build in linea non è più questa.
 */
export function useNuovaVersione({
  buildCorrente = import.meta.env.VITE_BUILD_ID,
  intervalloMs = INTERVALLO_VERSIONE_MS,
} = {}) {
  const [nuova, setNuova] = useState(false);

  useEffect(() => {
    if (!buildCorrente || nuova) return undefined;
    let attivo = true;

    const verifica = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const risposta = await fetch("/version.json", { cache: "no-store" });
        if (!risposta.ok) return;
        const { build } = await risposta.json();
        if (attivo && typeof build === "string" && build && build !== buildCorrente) {
          setNuova(true);
        }
      } catch {
        // Offline, oppure un deploy senza version.json: la riscrittura di
        // vercel.json risponde con l'HTML, e `json()` solleva. Nessuna
        // risposta leggibile, nessun avviso.
      }
    };
    const suVisibile = () => {
      if (document.visibilityState === "visible") verifica();
    };

    const timer = setInterval(verifica, intervalloMs);
    document.addEventListener("visibilitychange", suVisibile);
    window.addEventListener("online", verifica);
    return () => {
      attivo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", suVisibile);
      window.removeEventListener("online", verifica);
    };
  }, [buildCorrente, intervalloMs, nuova]);

  return nuova;
}
