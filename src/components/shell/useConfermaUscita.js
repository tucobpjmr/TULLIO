// src/components/shell/useConfermaUscita.js
// M-4 dell'audit del 4 novembre · prima di uscire, chi ha modifiche fatte
// senza rete e non ancora consegnate lo deve sapere.
//
// Il logout ora toglie dalla coda offline le scritture di chi esce
// (auth/AuthContext.jsx → state/codaDispositivo.js): restavano su IndexedDB
// fino a sette giorni, con i dati dentro, su un dispositivo spesso condiviso.
// Il prezzo è che quelle scritture non arriveranno più al server — e una
// perdita di lavoro va chiesta, non decisa in silenzio. Senza voci in attesa
// non si chiede niente: è il caso di quasi ogni logout.
import { useCallback } from "react";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { scrittureInAttesa } from "../../state/codaDispositivo.js";

/** @returns {() => Promise<boolean>} `true` se si può uscire. */
export function useConfermaUscita() {
  const conferma = useConfirm();
  const { currentUserId } = useAppData();
  return useCallback(async () => {
    const n = await scrittureInAttesa(currentUserId);
    if (!n) return true;
    return conferma({
      title: "Modifiche non ancora inviate",
      body: n === 1
        ? "Una modifica fatta senza rete non è ancora arrivata al server. Se esci ora andrà persa."
        : `${n} modifiche fatte senza rete non sono ancora arrivate al server. Se esci ora andranno perse.`,
      cta: "Esci comunque",
      danger: true,
    });
  }, [conferma, currentUserId]);
}
