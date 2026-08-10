// ─── useOnlineStatus (criticità #7) ────────────────────────────────────────
// Stato di rete del browser, come React state invece che come lettura una
// tantum di `navigator.onLine`.
//
// PERCHÉ ESISTE. Senza rete l'app non smette di funzionare: continua a
// mostrare l'ultimo stato idratato e ad accettare scritture, che falliscono
// una per una con un toast rosso ciascuna. Il risultato è un gestionale che
// afferma con sicurezza cose che non può più verificare — "nessun task in
// scadenza" può voler dire "nessuno", oppure "non lo so più da venti minuti" —
// e nulla a schermo distingue i due casi. Il banner che consuma questo hook
// (components/shell/OfflineBanner.jsx) rende la differenza visibile e
// persistente, non un toast che sparisce dopo tre secondi.
//
// LIMITE DICHIARATO. `navigator.onLine` è affidabile in una sola direzione:
// `false` significa davvero "nessuna interfaccia di rete raggiungibile",
// mentre `true` significa soltanto "esiste una connessione", non che Supabase
// risponda (captive portal, DNS rotto, backend giù). Il banner quindi non
// mente per eccesso — se compare, offline lo siamo — ma può non comparire in
// scenari in cui la rete c'è e i dati no. Coprire anche quelli richiede un
// segnale applicativo (stato del canale realtime, esito delle query), che è
// una feature diversa da questa.
import { useState, useEffect } from "react";

// jsdom e i browser antichi possono non esporre `navigator.onLine`: in dubbio
// si assume online, così un ambiente che non sa rispondere non mostra un
// allarme permanente e falso.
const leggiOnline = () =>
  typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
    ? true
    : navigator.onLine;

export function useOnlineStatus() {
  const [online, setOnline] = useState(leggiOnline);

  useEffect(() => {
    const vaiOnline = () => setOnline(true);
    const vaiOffline = () => setOnline(false);
    window.addEventListener("online", vaiOnline);
    window.addEventListener("offline", vaiOffline);
    // Riallineamento al mount: fra il primo render e l'esecuzione dell'effetto
    // la rete può essere già caduta, e quell'evento sarebbe stato emesso prima
    // che i listener esistessero. È idempotente — se il valore coincide React
    // esce dal set senza ri-renderizzare — quindi non serve confrontarlo qui
    // (e confrontarlo costringerebbe `online` fra le dipendenze, ri-agganciando
    // i listener a ogni cambio di stato).
    setOnline(leggiOnline());
    return () => {
      window.removeEventListener("online", vaiOnline);
      window.removeEventListener("offline", vaiOffline);
    };
  }, []);

  return online;
}
