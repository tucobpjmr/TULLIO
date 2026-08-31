// src/hooks/useFreschezzaRealtime.js
// A-1 dell'audit UX/errori del 31 agosto · il lato React del registro.
//
// La coppia con lib/freschezzaRealtime.js è la stessa di lib/errorReporting.js
// con VoyageDesk: il modulo puro non conosce React, e l'aggancio vive qui —
// così i nove produttori (le istanze di useDebouncedTableSubscription) possono
// importarlo senza trascinarsi dietro un hook che non useranno mai.
//
// `useSyncExternalStore` e non `useState` + effetto, per la ragione per cui
// esiste: fra il primo render e l'esecuzione di un effetto un canale può
// essere già caduto, e quella transizione sarebbe stata notificata prima che
// il listener esistesse. `getSnapshot` è letto in fase di render, quindi il
// valore iniziale è quello vero e non quello di un istante prima — è lo stesso
// buco che `useOnlineStatus` chiude a mano con il riallineamento al mount.
import { useSyncExternalStore } from "react";
import { freschezzaDegradata, osservaFreschezza } from "../lib/freschezzaRealtime.js";

// Sul server non c'è nessun canale, quindi la freschezza non è degradata: è la
// risposta giusta anche per il primo render di un test che non ha mai
// sottoscritto niente.
const snapshotServer = () => false;

/** @returns {boolean} `true` = almeno un canale realtime non consegna più eventi. */
export function useFreschezzaRealtime() {
  return useSyncExternalStore(osservaFreschezza, freschezzaDegradata, snapshotServer);
}
